/**
 * What a phone remembers across a reload so it rejoins silently (FR-021): the room code, the team
 * per room, and the nickname. localStorage can throw or be missing (private windows), so every
 * access is wrapped and the app works without it.
 */
const ROOM_KEY = 'gst:buzz:room';
const NICKNAME_KEY = 'gst:buzz:nick';
const teamKey = (room: string): string => `gst:buzz:team:${room}`;

const read = (key: string): string | null => {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
  } catch {
    // Storage is a convenience only.
  }
};

export const phoneStorage = {
  getRoom: (): string | null => read(ROOM_KEY),
  setRoom: (room: string): void => {
    write(ROOM_KEY, room);
  },
  clearRoom: (): void => {
    write(ROOM_KEY, null);
  },
  getTeam: (room: string): number | null => {
    const value = Number(read(teamKey(room)));
    return Number.isInteger(value) && value >= 1 && value <= 8 ? value : null;
  },
  setTeam: (room: string, team: number): void => {
    write(teamKey(room), String(team));
  },
  clearTeam: (room: string): void => {
    write(teamKey(room), null);
  },
  getNickname: (): string => read(NICKNAME_KEY) ?? '',
  setNickname: (nickname: string): void => {
    write(NICKNAME_KEY, nickname === '' ? null : nickname);
  },
};
