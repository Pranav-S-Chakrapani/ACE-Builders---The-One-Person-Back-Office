/**
 * Returns a new random id. Uses crypto.randomUUID when available,
 * otherwise builds an RFC 4122 v4-shaped id from Math.random.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** Current time as an ISO 8601 string. */
export function now(): string {
  return new Date().toISOString();
}

