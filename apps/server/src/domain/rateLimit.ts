/** True when one more action fits: fewer than `limit` timestamps inside the window. */
export function withinRateLimit(timestampsMs: number[], nowMs: number, limit: number, windowMs: number): boolean {
  const recent = timestampsMs.filter((t) => nowMs - t < windowMs);
  return recent.length < limit;
}
