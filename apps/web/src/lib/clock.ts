let offsetMs = 0;

/** Set from /api/meta. Non-zero after a demo fast-forward. */
export function setServerClockOffset(ms: number) {
  offsetMs = ms;
}

/** "Now" on the server's clock, so relative times and windows match server timestamps. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}
