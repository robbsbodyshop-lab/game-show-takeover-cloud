/** The phone join address (FR-020): `${origin}/play?room=CODE`. */
export const joinUrl = (origin: string, code: string): string =>
  `${origin}/play?room=${encodeURIComponent(code)}`;

/** The same address without scheme and query, short enough to read aloud from the back of a room. */
export const shortJoinAddress = (origin: string): string => `${origin.replace(/^https?:\/\//, '')}/play`;
