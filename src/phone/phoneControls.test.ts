import { describe, expect, it } from 'vitest';
import {
  buzzPresentation,
  canTypeAnswer,
  cleanRoomCode,
  hasPodiumActions,
  TYPE_YOUR_ANSWER,
  type PhoneControls,
} from './phoneControls';

const base: PhoneControls = {
  activeTeam: null,
  canBuy: false,
  canSpin: false,
  canSolve: false,
  turnName: '',
};

describe('buzzPresentation', () => {
  it('is live for a team in buzzTeams, whatever the off-label says', () => {
    expect(buzzPresentation({ ...base, buzzTeams: [2, 3], offLabel: 'Buzzers are off' }, 2)).toEqual({
      live: true,
      label: 'BUZZ',
    });
  });

  it('shows the stage off-label for a team that may not buzz', () => {
    for (const offLabel of ['Not in this match', 'Locked out of this puzzle', 'Buzzers are off']) {
      expect(buzzPresentation({ ...base, buzzTeams: [1], offLabel }, 2)).toEqual({
        live: false,
        label: offLabel,
      });
    }
  });

  it('says who the phone is waiting for when another team is up', () => {
    expect(buzzPresentation({ ...base, activeTeam: 1, turnName: 'Reds' }, 2).label).toBe('Waiting for Reds');
    expect(buzzPresentation({ ...base, activeTeam: 1 }, 2).label).toBe('Waiting for the other team');
  });

  it('falls back to "Buzzers are off" with no controls or no reason', () => {
    expect(buzzPresentation(null, 1).label).toBe('Buzzers are off');
    expect(buzzPresentation(base, 1)).toEqual({ live: false, label: 'Buzzers are off' });
  });

  it('never shows the typing literal as a button label', () => {
    expect(buzzPresentation({ ...base, offLabel: TYPE_YOUR_ANSWER, buzzTeams: [1] }, 2).label).toBe(
      'Buzzers are off',
    );
  });
});

describe('canTypeAnswer', () => {
  const typing: PhoneControls = { ...base, offLabel: TYPE_YOUR_ANSWER };

  it('needs the literal off-label', () => {
    expect(canTypeAnswer(base, 1)).toBe(false);
    expect(canTypeAnswer(null, 1)).toBe(false);
    expect(canTypeAnswer(typing, 1)).toBe(true);
  });

  it('is limited to the active team and to buzzTeams when given', () => {
    expect(canTypeAnswer({ ...typing, activeTeam: 1 }, 1)).toBe(true);
    expect(canTypeAnswer({ ...typing, activeTeam: 1 }, 2)).toBe(false);
    expect(canTypeAnswer({ ...typing, buzzTeams: [2] }, 1)).toBe(false);
    expect(canTypeAnswer({ ...typing, buzzTeams: [2] }, 2)).toBe(true);
  });
});

describe('hasPodiumActions', () => {
  it('is true only for the active team with something to do', () => {
    expect(hasPodiumActions({ ...base, activeTeam: 2, canSpin: true }, 2)).toBe(true);
    expect(hasPodiumActions({ ...base, activeTeam: 2 }, 2)).toBe(false);
    expect(hasPodiumActions({ ...base, activeTeam: 1, canSpin: true }, 2)).toBe(false);
    expect(hasPodiumActions(null, 2)).toBe(false);
  });
});

describe('cleanRoomCode', () => {
  it('uppercases, drops vowels, digits and spaces, and caps at four letters', () => {
    expect(cleanRoomCode('bkdx')).toBe('BKDX');
    expect(cleanRoomCode('b a k 1 d x z')).toBe('BKDX');
    expect(cleanRoomCode('AEIOU')).toBe('');
  });
});
