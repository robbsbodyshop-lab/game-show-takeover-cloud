import { describe, expect, it } from 'vitest';
import { defaultTeamEdits } from '@/engines/event';
import { MAX_TEAM_NAME_LENGTH, parsePlayers, validateTeamEdits } from './teamsValidation';

describe('validateTeamEdits', () => {
  it('accepts 2 to 8 uniquely named teams', () => {
    for (const n of [2, 3, 8]) expect(validateTeamEdits(defaultTeamEdits(n)).ok).toBe(true);
  });

  it('rejects fewer than 2 and more than 8 teams', () => {
    const one = validateTeamEdits(defaultTeamEdits(1));
    expect(one.ok).toBe(false);
    expect(one.countError).toMatch(/2 to 8/);
    const nine = [...defaultTeamEdits(8), { name: 'Ninth', color: '#fff', players: [] }];
    expect(validateTeamEdits(nine).countError).toMatch(/2 to 8/);
  });

  it('flags empty, over-long and duplicate names (case and space insensitive)', () => {
    const edits = defaultTeamEdits(4);
    edits[0] = { ...edits[0]!, name: '   ' };
    edits[2] = { ...edits[2]!, name: 'x'.repeat(MAX_TEAM_NAME_LENGTH + 1) };
    edits[3] = { ...edits[3]!, name: ' team 2 ' };
    const result = validateTeamEdits(edits);
    expect(result.ok).toBe(false);
    expect(result.nameErrors[0]).toMatch(/name/i);
    expect(result.nameErrors[1]).toBeNull();
    expect(result.nameErrors[2]).toMatch(/or fewer/);
    expect(result.nameErrors[3]).toMatch(/already/);
  });
});

describe('parsePlayers', () => {
  it('splits on commas and drops blanks', () => {
    expect(parsePlayers(' Ann, Bob ,, ')).toEqual(['Ann', 'Bob']);
    expect(parsePlayers('')).toEqual([]);
  });
});
