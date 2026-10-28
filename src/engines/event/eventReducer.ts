/**
 * Event wrapper reducer (design.md 8.3; FR-003..006, FR-037, FR-045, FR-050..055).
 * Engine contract: pure `(state, action) => state`, an illegal action returns the very same
 * object, randomness (`draw`) and time (`now`) arrive inside actions.
 *
 * Phase map:
 *   setup -> (doors ->) hub <-> feud | wheel | speed | plinko | puzzle ; hub|plinko -> winner
 * "Game phases" (no team edits) are feud, wheel, speed, plinko, puzzle and winner.
 *
 * gameInstance: bumped whenever a game ends (GAME_WON credited) or is abandoned, so each
 * START_GAME runs under a unique value. A controller may stamp its GAME_WON with the instance it
 * was started under; a mismatching report is ignored (idempotent per instance).
 */
import { createDoors, pickDoor, revealDoors } from './doors';
import {
  createPlinkoState,
  dropPath,
  isValidColumn,
  recordDrop,
  selectColumn,
  selectedColumn,
  slotValue,
} from './plinko';
import { createSpeedState, pauseSpeed, resumeSpeed, startSpeed, timeUpSpeed } from './speed';
import { createBracket, isComplete, recordMatchWinner } from './tournament';
import type {
  BracketState,
  EventAction,
  EventSession,
  EventSettings,
  GamePhase,
  MainGameKind,
  ScoreAward,
  Team,
  TeamEdit,
} from './types';
import { MAX_TEAMS, MIN_TEAMS } from './types';

export const ALL_MAIN_GAMES: readonly MainGameKind[] = ['feud', 'wheel'];
export const WINNER_CHIPS = 1;
export const DEFAULT_TEAM_COLORS: readonly string[] = [
  '#e63946',
  '#2a9df4',
  '#2ecc71',
  '#ffd23f',
  '#9b5de5',
  '#ff8c42',
  '#00c2a8',
  '#f15bb5',
];
export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  speedRoundMs: 60_000,
  plinkoSlotValues: [100, 200, 300, 500, 1000, 500, 300, 200, 100],
};

const TEAM_EDIT_PHASES: readonly GamePhase[] = ['setup', 'doors', 'hub'];

export function defaultTeamEdits(count: number): TeamEdit[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Team ${i + 1}`,
    color: DEFAULT_TEAM_COLORS[i] ?? '#ffffff',
    players: [],
  }));
}

function buildTeams(edits: readonly TeamEdit[], previous: readonly Team[]): Team[] {
  return edits.map((e, i) => ({
    id: i + 1,
    name: e.name.trim(),
    color: e.color,
    players: e.players.map((p) => p.trim()).filter((p) => p.length > 0),
    score: previous[i]?.score ?? 0,
    chips: previous[i]?.chips ?? 0,
  }));
}

function validTeamEdits(edits: readonly TeamEdit[]): boolean {
  return (
    edits.length >= MIN_TEAMS &&
    edits.length <= MAX_TEAMS &&
    edits.every(
      (e) =>
        typeof e.name === 'string' &&
        e.name.trim().length > 0 &&
        typeof e.color === 'string' &&
        e.color.length > 0 &&
        Array.isArray(e.players) &&
        e.players.every((p) => typeof p === 'string'),
    )
  );
}

/** A fresh session in the setup phase. Defaults to two default-named teams. */
export function createEventSession(
  edits: readonly TeamEdit[] = defaultTeamEdits(MIN_TEAMS),
  settings: EventSettings = DEFAULT_EVENT_SETTINGS,
): EventSession {
  return {
    schemaVersion: 1,
    teams: buildTeams(edits, []),
    phase: 'setup',
    availableMainGames: [...ALL_MAIN_GAMES],
    completedGames: [],
    usedContentIds: [],
    playOrder: null,
    bracket: null,
    gameInstance: 0,
    game: null,
    doors: null,
    plinko: null,
    speed: null,
    settings: { ...settings, plinkoSlotValues: [...settings.plinkoSlotValues] },
  };
}

const hasTeam = (s: EventSession, id: number): boolean => s.teams.some((t) => t.id === id);
const isInt = (n: number): boolean => Number.isInteger(n);

function mapTeam(teams: Team[], id: number, fn: (t: Team) => Team): Team[] {
  return teams.map((t) => (t.id === id ? fn(t) : t));
}

function isPermutationOfTeams(s: EventSession, order: readonly number[]): boolean {
  return (
    order.length === s.teams.length &&
    s.teams.every((t) => order.includes(t.id)) &&
    new Set(order).size === order.length
  );
}

/** Validate a list of awards against the current teams. */
function validAwards(s: EventSession, awards: readonly ScoreAward[]): boolean {
  return awards.every((a) => hasTeam(s, a.team) && isInt(a.points));
}

function applyAwards(teams: Team[], awards: readonly ScoreAward[]): Team[] {
  return teams.map((t) => {
    const sum = awards.filter((a) => a.team === t.id).reduce((acc, a) => acc + a.points, 0);
    return sum === 0 ? t : { ...t, score: t.score + sum };
  });
}

/** Back to the hub with all game-ish state cleared; the instance is bumped when a game slot ends. */
function toHub(s: EventSession, bump: boolean): EventSession {
  return {
    ...s,
    phase: 'hub',
    game: null,
    doors: null,
    plinko: null,
    speed: null,
    gameInstance: bump ? s.gameInstance + 1 : s.gameInstance,
  };
}

function setTeams(s: EventSession, edits: TeamEdit[]): EventSession {
  if (!TEAM_EDIT_PHASES.includes(s.phase) || !validTeamEdits(edits)) return s;
  const teams = buildTeams(edits, s.teams);
  if (teams.length === s.teams.length) return { ...s, teams };

  // A change of team count invalidates the order and bracket and reopens the door game (1.3, 2.4).
  const cleared: EventSession = { ...s, teams, playOrder: null, bracket: null, doors: null };
  if (s.phase === 'setup') return cleared;
  if (teams.length >= 3) return { ...cleared, phase: 'doors', doors: createDoors(teams.length) };
  return { ...cleared, phase: 'hub' };
}

function startDoors(s: EventSession): EventSession {
  if ((s.phase !== 'setup' && s.phase !== 'hub') || s.teams.length < 3 || s.bracket !== null) return s;
  return { ...s, phase: 'doors', doors: createDoors(s.teams.length) };
}

function doorPickAction(s: EventSession, team: number, door: number): EventSession {
  if (s.phase !== 'doors' || !s.doors) return s;
  const doors = pickDoor(
    s.doors,
    s.teams.map((t) => t.id),
    team,
    door,
  );
  return doors === s.doors ? s : { ...s, doors };
}

function doorsReveal(s: EventSession, draw: number[]): EventSession {
  if (s.phase !== 'doors' || !s.doors) return s;
  const reveal = revealDoors(s.doors, draw);
  if (!reveal) return s;
  return { ...s, doors: reveal.doors, playOrder: reveal.playOrder };
}

function setPlayOrder(s: EventSession, order: number[]): EventSession {
  if (!TEAM_EDIT_PHASES.includes(s.phase) || s.bracket !== null || !isPermutationOfTeams(s, order)) return s;
  // Choosing the order by hand skips the door game.
  return { ...s, playOrder: [...order], phase: s.phase === 'doors' ? 'hub' : s.phase, doors: null };
}

function startGame(s: EventSession, kind: MainGameKind, instanceSeed: number): EventSession {
  if (!Number.isFinite(instanceSeed) || s.game !== null || !s.availableMainGames.includes(kind)) return s;
  const betweenMatches = s.phase === kind && kind === 'feud' && s.bracket !== null;
  if (s.phase !== 'hub' && !betweenMatches) return s;

  let bracket: BracketState | null = s.bracket;
  if (kind === 'feud' && s.teams.length >= 3) {
    bracket ??= createBracket(s.playOrder ?? s.teams.map((t) => t.id));
    if (isComplete(bracket)) return s;
  }
  return { ...s, phase: kind, bracket, game: { kind, instanceSeed, state: null } };
}

function gameWon(s: EventSession, a: Extract<EventAction, { type: 'GAME_WON' }>): EventSession {
  const game = s.game;
  if (s.phase !== game?.kind) return s;
  if (a.gameInstance !== undefined && a.gameInstance !== s.gameInstance) return s;
  const extras = a.extraScores ?? [];
  const bonus = a.bonusChips ?? 0;
  if (!hasTeam(s, a.winnerId) || !isInt(a.roundScore) || !isInt(bonus) || bonus < 0) return s;
  if (!validAwards(s, extras) || extras.some((e) => e.team === a.winnerId)) return s;

  let bracket = s.bracket;
  if (game.kind === 'feud' && bracket) {
    const next = recordMatchWinner(bracket, a.winnerId);
    if (next === bracket) return s; // winner is not in the current match
    bracket = next;
  }

  const teams = applyAwards(
    mapTeam(s.teams, a.winnerId, (t) => ({
      ...t,
      score: t.score + a.roundScore,
      chips: t.chips + WINNER_CHIPS + bonus,
    })),
    extras,
  );

  const bracketRunning = bracket !== null && !isComplete(bracket);
  const base: EventSession = { ...s, teams, bracket, game: null, gameInstance: s.gameInstance + 1 };
  if (bracketRunning) return base; // stay in the feud phase; the next match starts with START_GAME
  return {
    ...base,
    phase: 'hub',
    completedGames: s.completedGames.includes(game.kind)
      ? s.completedGames
      : [...s.completedGames, game.kind],
    availableMainGames: s.availableMainGames.filter((k) => k !== game.kind),
  };
}

function abandonGame(s: EventSession): EventSession {
  if (s.phase !== 'feud' && s.phase !== 'wheel') return s;
  return toHub(s, true);
}

function delta(s: EventSession, team: number, d: number, field: 'score' | 'chips'): EventSession {
  if (!hasTeam(s, team) || !isInt(d) || d === 0) return s;
  const target = s.teams.find((t) => t.id === team);
  if (!target) return s;
  const value = Math.max(0, target[field] + d);
  if (value === target[field]) return s;
  return { ...s, teams: mapTeam(s.teams, team, (t) => ({ ...t, [field]: value })) };
}

function contentUsed(s: EventSession, ids: string[]): EventSession {
  const fresh = [...new Set(ids)].filter(
    (id) => typeof id === 'string' && id.length > 0 && !s.usedContentIds.includes(id),
  );
  return fresh.length === 0 ? s : { ...s, usedContentIds: [...s.usedContentIds, ...fresh] };
}

function resetScores(s: EventSession): EventSession {
  if (s.phase === 'setup') return s;
  const teams = s.teams.map((t) => ({ ...t, score: 0, chips: 0 }));
  const cleared: EventSession = {
    ...s,
    teams,
    bracket: null,
    availableMainGames: [...ALL_MAIN_GAMES],
    completedGames: [],
    usedContentIds: [],
  };
  if (s.phase === 'doors') return cleared;
  return toHub(cleared, s.game !== null || s.phase === 'feud' || s.phase === 'wheel');
}

function newEvent(s: EventSession): EventSession {
  const fresh = createEventSession(s.teams, s.settings);
  return { ...fresh, gameInstance: s.gameInstance + 1 };
}

function goHub(s: EventSession): EventSession {
  switch (s.phase) {
    case 'setup':
      return s.teams.length < 3 || s.playOrder !== null ? toHub(s, false) : s;
    case 'doors':
      return s.doors?.stage === 'done' ? toHub(s, false) : s;
    case 'speed':
    case 'puzzle':
    case 'winner':
      return toHub(s, false);
    default:
      return s; // hub already; feud/wheel use ABANDON_GAME, plinko uses END_PLINKO
  }
}

function startSpeedRound(s: EventSession): EventSession {
  if (s.phase !== 'hub') return s;
  return { ...s, phase: 'speed', speed: createSpeedState(s.settings.speedRoundMs) };
}

function speedClock(
  s: EventSession,
  fn: (clock: NonNullable<EventSession['speed']>, now: number) => NonNullable<EventSession['speed']>,
  now: number,
): EventSession {
  if (s.phase !== 'speed' || !s.speed) return s;
  const speed = fn(s.speed, now);
  return speed === s.speed ? s : { ...s, speed };
}

function speedResult(s: EventSession, awards: ScoreAward[]): EventSession {
  if (s.phase !== 'speed' || !validAwards(s, awards)) return s;
  return toHub({ ...s, teams: applyAwards(s.teams, awards) }, false);
}

function startPlinko(s: EventSession): EventSession {
  if (s.phase !== 'hub') return s;
  return { ...s, phase: 'plinko', plinko: createPlinkoState() };
}

function plinkoSelect(s: EventSession, team: number, column: number): EventSession {
  if (s.phase !== 'plinko' || !s.plinko || !hasTeam(s, team) || !isValidColumn(column)) return s;
  const plinko = selectColumn(s.plinko, team, column);
  return plinko === s.plinko ? s : { ...s, plinko };
}

function plinkoDrop(s: EventSession, team: number, draw: number[]): EventSession {
  if (s.phase !== 'plinko' || !s.plinko) return s;
  const t = s.teams.find((x) => x.id === team);
  const column = selectedColumn(s.plinko, team);
  if (!t || t.chips < 1 || column === null) return s;
  const path = dropPath(column, draw);
  if (!path) return s;
  const points = slotValue(s.settings.plinkoSlotValues, path.slot);
  return {
    ...s,
    teams: mapTeam(s.teams, team, (x) => ({ ...x, chips: x.chips - 1, score: x.score + points })),
    plinko: recordDrop(s.plinko, { team, column, xs: path.xs, slot: path.slot, points }),
  };
}

export function eventReducer(state: EventSession, action: EventAction): EventSession {
  switch (action.type) {
    case 'SET_TEAMS':
      return setTeams(state, action.teams);
    case 'START_DOORS':
      return startDoors(state);
    case 'DOOR_PICK':
      return doorPickAction(state, action.team, action.door);
    case 'DOORS_REVEAL':
      return doorsReveal(state, action.draw);
    case 'SET_PLAY_ORDER':
      return setPlayOrder(state, action.order);
    case 'START_GAME':
      return startGame(state, action.kind, action.instanceSeed);
    case 'GAME_STATE':
      if (!state.game || state.game.state === action.state) return state;
      return { ...state, game: { ...state.game, state: action.state } };
    case 'GAME_WON':
      return gameWon(state, action);
    case 'ABANDON_GAME':
      return abandonGame(state);
    case 'SCORE_CHANGE':
      return delta(state, action.team, action.delta, 'score');
    case 'CHIP_CHANGE':
      return delta(state, action.team, action.delta, 'chips');
    case 'CONTENT_USED':
      return contentUsed(state, action.ids);
    case 'START_SPEED':
      return startSpeedRound(state);
    case 'SPEED_START':
      return speedClock(state, startSpeed, action.now);
    case 'SPEED_PAUSE':
      return speedClock(state, pauseSpeed, action.now);
    case 'SPEED_RESUME':
      return speedClock(state, resumeSpeed, action.now);
    case 'SPEED_TIME_UP':
      return speedClock(state, timeUpSpeed, action.now);
    case 'SPEED_RESULT':
      return speedResult(state, action.awards);
    case 'START_PLINKO':
      return startPlinko(state);
    case 'PLINKO_SELECT_COLUMN':
      return plinkoSelect(state, action.team, action.column);
    case 'PLINKO_DROP':
      return plinkoDrop(state, action.team, action.draw);
    case 'END_PLINKO':
      return state.phase === 'plinko' ? toHub(state, false) : state;
    case 'START_PUZZLE':
      return state.phase === 'hub' ? { ...state, phase: 'puzzle' } : state;
    case 'ANNOUNCE_WINNER':
      return state.phase === 'hub' || state.phase === 'plinko'
        ? { ...state, phase: 'winner', plinko: null }
        : state;
    case 'GO_HUB':
      return goHub(state);
    case 'NEW_EVENT':
      return newEvent(state);
    case 'RESET_SCORES':
      return resetScores(state);
  }
}
