/**
 * A server-wide budget of reads: up to `capacity` at once, refilled at `refillPerSecond`. Bounds what
 * any number of requests together can ask of an upstream with a per-address budget of its own
 * (the image route's Pinakes and page reads). It is per server instance, not per client: behind the
 * app's proxies a client's forwarded address can be spoofed, so a limit per client belongs at the
 * deployment's edge, keyed by the address its own proxy trusts.
 */
export class TokenBucket {
  private tokens: number;
  private refilledAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.refilledAt = Date.now();
  }

  /**
   * Takes one read from the budget: `false`, taking nothing, when it is spent. `reserve` reads are left
   * for other callers (re-reads of what is already known), so this one takes only beyond them.
   */
  take(reserve = 0): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.refilledAt) / 1000) * this.refillPerSecond);
    this.refilledAt = now;
    if (this.tokens < 1 + reserve) return false;
    this.tokens -= 1;
    return true;
  }

  /** Fills the budget again (tests). */
  reset(): void {
    this.tokens = this.capacity;
    this.refilledAt = Date.now();
  }
}
