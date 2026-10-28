import { afterEach, describe, expect, it, vi } from 'vitest';
import { phoneStorage } from './phoneStorage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('phoneStorage', () => {
  it('stores the room, the team per room and the nickname under the documented keys', () => {
    phoneStorage.setRoom('BKDX');
    phoneStorage.setTeam('BKDX', 3);
    phoneStorage.setNickname('Ada');
    expect(localStorage.getItem('gst:buzz:room')).toBe('BKDX');
    expect(localStorage.getItem('gst:buzz:team:BKDX')).toBe('3');
    expect(phoneStorage.getRoom()).toBe('BKDX');
    expect(phoneStorage.getTeam('BKDX')).toBe(3);
    expect(phoneStorage.getTeam('BCDF')).toBeNull();
    expect(phoneStorage.getNickname()).toBe('Ada');
    phoneStorage.clearTeam('BKDX');
    phoneStorage.clearRoom();
    expect(phoneStorage.getTeam('BKDX')).toBeNull();
    expect(phoneStorage.getRoom()).toBeNull();
  });

  it('ignores a corrupt team value', () => {
    localStorage.setItem('gst:buzz:team:BKDX', '99');
    expect(phoneStorage.getTeam('BKDX')).toBeNull();
    localStorage.setItem('gst:buzz:team:BKDX', 'abc');
    expect(phoneStorage.getTeam('BKDX')).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(phoneStorage.getRoom()).toBeNull();
    expect(phoneStorage.getNickname()).toBe('');
    expect(() => {
      phoneStorage.setRoom('BKDX');
      phoneStorage.setTeam('BKDX', 1);
    }).not.toThrow();
  });
});
