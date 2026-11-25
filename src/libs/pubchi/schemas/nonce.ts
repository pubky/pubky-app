/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

/**
 * Postgres-ready nonce interface. Implementations persist (bot, nonce) until
 * expiresAt. No database code lives in this package.
 */
export interface NonceStore {
  /**
   * Record `nonce` for `bot`. Returns true on first use, false on replay.
   * `expiresAt` is unix seconds; stores may drop rows after that.
   */
  consume(bot: string, nonce: string, expiresAt: number): Promise<boolean>;
}

export class MemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>();

  async consume(bot: string, nonce: string, expiresAt: number): Promise<boolean> {
    const key = `${bot}:${nonce}`;
    const prev = this.seen.get(key);
    if (prev !== undefined) return false;
    this.seen.set(key, expiresAt);
    return true;
  }

  /** Test helper: mark a nonce already consumed. */
  seed(bot: string, nonce: string, expiresAt: number): void {
    this.seen.set(`${bot}:${nonce}`, expiresAt);
  }

  clear(): void {
    this.seen.clear();
  }
}
