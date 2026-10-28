/**
 * The phone's screen flow (FR-021, FR-026, FR-028): sign in anonymously, take the room code from
 * `?room=` or storage, validate it with `joinRoom`, pick a team, then play.
 *
 * Demo mode (`services.mode === 'demo'`): the phone's in-memory data layer belongs to its own tab and
 * knows no room, so `joinRoom` would always say "not found". Instead any well-formed code is accepted
 * and `DEMO_TEAMS` (8 teams) is offered; the stage's `teams` message renames them once connected.
 *
 * Real mode: `joinRoom(code, team, nickname)` both validates the code and returns the teams, but it
 * needs a team number. Before a team is chosen it is called with team 1 as a placeholder, and again
 * with the real team when one is picked (the RPC upserts the membership).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import { DataError } from '@/data/errors';
import { isValidRoomCode, normalizeRoomCode } from '@/data/roomCode';
import type { TeamSummary } from '@/data/types';
import { logger } from '@/lib/logger';
import { DEMO_TEAMS } from './demoTeams';
import { phoneStorage } from './phoneStorage';

export const SETUP_POLL_MS = 5000;
export const MAX_NICKNAME = 24;

export type JoinError = 'not_found' | 'rate_limited' | 'unavailable' | 'gave_up';

export type PhoneFlowState =
  | { phase: 'signing-in' }
  | { phase: 'sign-in-failed' }
  | { phase: 'code'; code: string; error: JoinError | null; nonce: number }
  | { phase: 'joining'; code: string }
  | { phase: 'team'; code: string; teams: TeamSummary[]; settingUp: boolean }
  | { phase: 'play'; code: string; team: number; teams: TeamSummary[] };

type Resolution = { ok: true; teams: TeamSummary[] } | { ok: false; reason: JoinError };

export interface PhoneFlow {
  state: PhoneFlowState;
  userId: string | null;
  nickname: string;
  submitCode: (code: string) => void;
  pickTeam: (team: number, nickname: string) => void;
  changeTeam: () => void;
  changeRoom: () => void;
  giveUp: () => void;
  /** The stage published a new team list while we are playing. */
  stageTeams: (teams: TeamSummary[]) => void;
  retrySignIn: () => void;
}

const sameTeams = (a: readonly TeamSummary[], b: readonly TeamSummary[]): boolean =>
  a.length === b.length &&
  a.every((t, i) => t.id === b[i]?.id && t.name === b[i].name && t.color === b[i].color);

export function usePhoneFlow(search: string): PhoneFlow {
  const { data, mode } = useAppServices();
  const [state, setState] = useState<PhoneFlowState>({ phase: 'signing-in' });
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNicknameState] = useState(() => phoneStorage.getNickname());
  const [signInAttempt, setSignInAttempt] = useState(0);

  const nonce = useRef(0);
  const latest = useRef(0);
  const nicknameRef = useRef(nickname);
  const stateRef = useRef(state);
  useEffect(() => {
    nicknameRef.current = nickname;
    stateRef.current = state;
  });

  const resolveRoom = useCallback(
    async (code: string, team: number, nick: string): Promise<Resolution> => {
      if (mode === 'demo') {
        return isValidRoomCode(code)
          ? { ok: true, teams: [...DEMO_TEAMS] }
          : { ok: false, reason: 'not_found' };
      }
      try {
        const result = await data.rooms.joinRoom(code, team, nick);
        return result.ok ? { ok: true, teams: result.room.teams } : { ok: false, reason: result.reason };
      } catch (error) {
        logger.warn('[phone] joinRoom failed', error instanceof DataError ? error.code : error);
        return { ok: false, reason: 'unavailable' };
      }
    },
    [data, mode],
  );

  const toCode = useCallback((code: string, error: JoinError | null) => {
    nonce.current += 1;
    setState({ phase: 'code', code, error, nonce: nonce.current });
  }, []);

  /** Decides the screen after a successful lookup: play (stored team still exists) or the picker. */
  const enterRoom = useCallback((code: string, teams: TeamSummary[], storedTeam: number | null) => {
    phoneStorage.setRoom(code);
    if (teams.length > 0 && storedTeam !== null && teams.some((t) => t.id === storedTeam)) {
      setState({ phase: 'play', code, team: storedTeam, teams });
      return;
    }
    if (storedTeam !== null) phoneStorage.clearTeam(code);
    setState({ phase: 'team', code, teams, settingUp: teams.length === 0 });
  }, []);

  const failJoin = useCallback(
    (code: string, reason: JoinError) => {
      // A code the server rejects must not be retried silently on every reload.
      if (reason === 'not_found') phoneStorage.clearRoom();
      toCode(code, reason);
    },
    [toCode],
  );

  const joinWithCode = useCallback(
    async (code: string) => {
      const token = ++latest.current;
      setState({ phase: 'joining', code });
      const storedTeam = phoneStorage.getTeam(code);
      const result = await resolveRoom(code, storedTeam ?? 1, nicknameRef.current);
      if (token !== latest.current) return;
      if (result.ok) enterRoom(code, result.teams, storedTeam);
      else failJoin(code, result.reason);
    },
    [resolveRoom, enterRoom, failJoin],
  );

  // --- 1. anonymous sign-in, then the first room lookup --------------------------------------------
  useEffect(() => {
    // An object, not a `let`: TypeScript would otherwise narrow the flag to `false` across the awaits.
    const lifetime = { cancelled: false };
    void (async () => {
      // Reuse an existing anonymous session (reload, StrictMode) instead of minting a new user.
      const existing = await data.auth.getSession().catch(() => null);
      let session = existing?.user.isAnonymous === true ? existing : null;
      if (session === null) {
        const result = await data.auth.signInAnonymously().catch(() => null);
        session = result?.ok === true ? result.session : null;
      }
      if (lifetime.cancelled) return;
      const id = session?.user.id;
      if (id === undefined) {
        setState({ phase: 'sign-in-failed' });
        return;
      }
      setUserId(id);
      const fromQuery = normalizeRoomCode(new URLSearchParams(search).get('room') ?? '');
      const stored = phoneStorage.getRoom();
      const code = isValidRoomCode(fromQuery)
        ? fromQuery
        : stored !== null && isValidRoomCode(stored)
          ? stored
          : '';
      if (code === '') {
        toCode('', null);
        return;
      }
      await joinWithCode(code);
    })();
    return () => {
      lifetime.cancelled = true;
    };
  }, [data, search, signInAttempt, joinWithCode, toCode]);

  // --- 2. "Host is still setting up": ask again every 5 s until teams exist ------------------------
  const settingUpCode = state.phase === 'team' && state.settingUp ? state.code : null;
  useEffect(() => {
    if (settingUpCode === null) return;
    let busy = false;
    const id = setInterval(() => {
      if (busy) return;
      busy = true;
      const storedTeam = phoneStorage.getTeam(settingUpCode);
      void resolveRoom(settingUpCode, storedTeam ?? 1, nicknameRef.current).then((result) => {
        busy = false;
        const current = stateRef.current;
        if (current.phase !== 'team' || current.code !== settingUpCode) return;
        if (!result.ok) {
          if (result.reason !== 'unavailable') failJoin(settingUpCode, result.reason);
        } else if (result.teams.length > 0) {
          enterRoom(settingUpCode, result.teams, storedTeam);
        }
      });
    }, SETUP_POLL_MS);
    return () => {
      clearInterval(id);
    };
  }, [settingUpCode, resolveRoom, enterRoom, failJoin]);

  // --- actions --------------------------------------------------------------------------------------
  const submitCode = useCallback(
    (raw: string) => {
      const code = normalizeRoomCode(raw);
      if (!isValidRoomCode(code)) {
        toCode(code, 'not_found');
        return;
      }
      void joinWithCode(code);
    },
    [joinWithCode, toCode],
  );

  const pickTeam = useCallback(
    (team: number, rawNickname: string) => {
      const current = stateRef.current;
      if (current.phase !== 'team') return;
      const { code } = current;
      const nick = rawNickname.trim().slice(0, MAX_NICKNAME);
      setNicknameState(nick);
      nicknameRef.current = nick;
      phoneStorage.setNickname(nick);
      const token = ++latest.current;
      void resolveRoom(code, team, nick).then((result) => {
        if (token !== latest.current) return;
        if (!result.ok) {
          failJoin(code, result.reason);
          return;
        }
        const teams = result.teams.length > 0 ? result.teams : current.teams;
        if (!teams.some((t) => t.id === team)) {
          setState({ phase: 'team', code, teams, settingUp: teams.length === 0 });
          return;
        }
        phoneStorage.setRoom(code);
        phoneStorage.setTeam(code, team);
        setState({ phase: 'play', code, team, teams });
      });
    },
    [resolveRoom, failJoin],
  );

  const changeTeam = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'play') return;
    phoneStorage.clearTeam(current.code);
    setState({ phase: 'team', code: current.code, teams: current.teams, settingUp: false });
  }, []);

  const leaveRoom = useCallback(
    (error: JoinError | null) => {
      const current = stateRef.current;
      latest.current += 1;
      if ('code' in current) {
        phoneStorage.clearTeam(current.code);
      }
      phoneStorage.clearRoom();
      if (mode !== 'demo') {
        data.rooms.leaveRoom().catch((e: unknown) => {
          logger.warn('[phone] leaveRoom failed', e);
        });
      }
      toCode('', error);
    },
    [data, mode, toCode],
  );

  const changeRoom = useCallback(() => {
    leaveRoom(null);
  }, [leaveRoom]);

  const giveUp = useCallback(() => {
    leaveRoom('gave_up');
  }, [leaveRoom]);

  const stageTeams = useCallback((teams: TeamSummary[]) => {
    const current = stateRef.current;
    if (current.phase !== 'play') return;
    if (!teams.some((t) => t.id === current.team)) {
      // Our team was removed (design.md §13): back to the picker.
      phoneStorage.clearTeam(current.code);
      setState({ phase: 'team', code: current.code, teams, settingUp: teams.length === 0 });
    } else if (!sameTeams(current.teams, teams)) {
      setState({ ...current, teams });
    }
  }, []);

  const retrySignIn = useCallback(() => {
    setState({ phase: 'signing-in' });
    setSignInAttempt((n) => n + 1);
  }, []);

  return {
    state,
    userId,
    nickname,
    submitCode,
    pickTeam,
    changeTeam,
    changeRoom,
    giveUp,
    stageTeams,
    retrySignIn,
  };
}
