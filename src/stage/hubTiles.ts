/** Hub tiles and their subtitles (HOST_FEATURE_INVENTORY.md 1.3), kept pure so they can be tested. */
import type { MemoryCardItem } from '@/design';
import { nextBracketMatch, plinkoChipsRemaining, teamsInPlayOrder, type EventSession } from '@/engines/event';

export type HubTileId =
  'order' | 'feud' | 'wheel' | 'speed' | 'puzzle' | 'plinko' | 'winner' | 'teams' | 'settings' | 'credits';

export const HUB_TILE_IDS: readonly HubTileId[] = [
  'order',
  'feud',
  'wheel',
  'speed',
  'puzzle',
  'plinko',
  'winner',
  'teams',
  'settings',
  'credits',
];

const PLAYED = '(played)';

export function hubTiles(session: EventSession): (MemoryCardItem & { id: HubTileId })[] {
  const teamCount = session.teams.length;
  const feudOpen = session.availableMainGames.includes('feud');
  const wheelOpen = session.availableMainGames.includes('wheel');
  const match = nextBracketMatch(session);

  const orderSubtitle = (): string => {
    if (teamCount < 3) return 'Needs three or more teams';
    if (session.bracket !== null) return 'Locked while the bracket runs';
    if (session.playOrder !== null) {
      return `Order: ${teamsInPlayOrder(session)
        .map((t) => t.name)
        .join(', ')}`;
    }
    return 'Play the door game';
  };

  const feudSubtitle = (): string => {
    if (!feudOpen) return PLAYED;
    if (teamCount >= 3) {
      return match ? `Bracket: ${match.a.name} vs ${match.b.name}` : 'Single-elimination bracket';
    }
    return 'Two families and Fast Money';
  };

  return [
    {
      id: 'order',
      title: 'Determine Play Order',
      subtitle: orderSubtitle(),
      icon: '?',
      disabled: teamCount < 3 || session.bracket !== null,
    },
    { id: 'feud', title: 'Family Feud', subtitle: feudSubtitle(), icon: 'FF', disabled: !feudOpen },
    {
      id: 'wheel',
      title: 'Wheel of Fortune',
      subtitle: wheelOpen ? 'Toss-ups, rounds and the Bonus Round' : PLAYED,
      icon: 'WF',
      disabled: !wheelOpen,
    },
    { id: 'speed', title: 'Speed Round', subtitle: 'Sixty seconds on the clock', icon: 'SR' },
    { id: 'puzzle', title: 'Puzzle Game', subtitle: 'One or two players', icon: 'PZ' },
    {
      id: 'plinko',
      title: 'Run Final Plinko',
      subtitle: `${String(plinkoChipsRemaining(session))} chips to drop`,
      icon: 'PL',
    },
    { id: 'winner', title: 'Announce the Winner', subtitle: 'Final standings', icon: 'WN' },
    { id: 'teams', title: 'Edit Teams', subtitle: 'Names, colours and players', icon: 'ED' },
    { id: 'settings', title: 'Settings', subtitle: 'Music, display and reset', icon: 'ST' },
    { id: 'credits', title: 'Credits', subtitle: 'Who made this', icon: 'CR' },
  ];
}
