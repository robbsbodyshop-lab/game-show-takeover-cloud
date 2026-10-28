let counter = 0;

/** A unique id for one press or action (1..64 chars, see the protocol schema). */
export function newPressId(): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${counter.toString(36)}-${random}`;
}
