/**
 * A clock with a demo offset, so "Fast-forward 72 h" on the /demo panel can show auto-close
 * and SOS expiry without waiting. Everything that needs "now" goes through a Clock.
 */
export class Clock {
  private offsetMs = 0;

  constructor(private readonly base: () => number = Date.now) {}

  nowMs(): number {
    return this.base() + this.offsetMs;
  }
  now(): Date {
    return new Date(this.nowMs());
  }
  iso(): string {
    return this.now().toISOString();
  }
  get offsetHours(): number {
    return this.offsetMs / 3_600_000;
  }
  setOffsetHours(h: number): void {
    this.offsetMs = h * 3_600_000;
  }
  advanceHours(h: number): void {
    this.offsetMs += h * 3_600_000;
  }
}

export const hoursAgo = (clock: Clock, h: number) => new Date(clock.nowMs() - h * 3_600_000).toISOString();
