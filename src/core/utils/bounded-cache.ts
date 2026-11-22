/** What `BoundedReadCache.read` answers for a new key while too many others are being read. */
export const BOUNDED_READ_BUSY = 'busy';

export interface TBoundedReadCacheOptions<T> {
  /** Keys kept at most, with or without a value. */
  maxEntries: number;
  /** Bytes of values kept at most, all keys together (`sizeOf`). */
  maxBytes: number;
  /** Reads of different keys running at once at most; past that a new key is `BOUNDED_READ_BUSY`. */
  maxInFlight: number;
  /** How long a value is answered without reading it again. */
  hitTtlMs: number;
  /** How long a key without a value (`null`) is not read again. */
  missTtlMs: number;
  /** A value's bytes, for `maxBytes`. */
  sizeOf: (value: T) => number;
  /** How long this value is kept, when it differs from `hitTtlMs` / `missTtlMs` (a card still being read). */
  ttlOf?: (value: T | null) => number | undefined;
  /** Whether a read's answer is remembered at all (not a busy or failed one); all by default. */
  keeps?: (value: T | null) => boolean;
}

type TEntry<T> = { value: T | null; bytes: number; expires: number; readAt: number };

/**
 * An in-memory cache of a server route's reads (`FaviconApplication`, `ImageApplication`), bounded by
 * entry count and by its values' total bytes (oldest used first out). A value is kept for `hitTtlMs`,
 * a miss (`null`) for `missTtlMs`, or for its own time (`ttlOf`); a read that fails (rejects), or
 * whose answer is not to be kept (`keeps`) or is larger than `maxBytes`, is not remembered, so the next
 * request reads again, and it leaves a value kept before in place (`stale`) until one replaces it.
 * Concurrent requests for one key share one read, and at most `maxInFlight` keys are read
 * at once: past that a new key gets `BOUNDED_READ_BUSY` (nothing read, nothing remembered).
 */
export class BoundedReadCache<T> {
  private readonly entries = new Map<string, TEntry<T>>();
  /** Bytes of the values in `entries`. */
  private bytes = 0;
  private readonly inFlight = new Map<string, Promise<T | null>>();

  constructor(private readonly options: TBoundedReadCacheOptions<T>) {}

  /**
   * The value of `key`, read by `load` unless a fresh one is kept, or `BOUNDED_READ_BUSY`.
   *
   * @param options.maxAgeMs - Read again a kept value read longer ago than this
   */
  async read(
    key: string,
    load: () => Promise<T | null>,
    { maxAgeMs }: { maxAgeMs?: number } = {},
  ): Promise<T | null | typeof BOUNDED_READ_BUSY> {
    const cached = this.entries.get(key);
    if (cached) {
      // Most recently used goes last, so the oldest used is evicted first.
      this.forget(key);
      this.keep(key, cached);
      const now = Date.now();
      if (cached.expires > now && (maxAgeMs === undefined || now - cached.readAt <= maxAgeMs)) return cached.value;
      // Too old: read again; the old value stays until a value to keep replaces it (`stale`).
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;
    if (this.inFlight.size >= this.options.maxInFlight) return BOUNDED_READ_BUSY;

    const promise = load()
      .then((value) => {
        this.remember(key, value);
        return value;
      })
      .finally(() => {
        // A read started after `clear` for the same key keeps its own slot.
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  /** Empties the cache (tests). */
  clear(): void {
    this.entries.clear();
    this.bytes = 0;
    this.inFlight.clear();
  }

  /**
   * The value kept for `key`, fresh or expired (a read that could not be made now may answer with it),
   * or `undefined` when none is kept.
   */
  stale(key: string): T | null | undefined {
    return this.entries.get(key)?.value;
  }

  private remember(key: string, value: T | null): void {
    // An answer not to keep, or one larger than the whole cache, leaves the kept value as it is.
    if (this.options.keeps && !this.options.keeps(value)) return;
    const bytes = value === null ? 0 : this.options.sizeOf(value);
    if (bytes > this.options.maxBytes) return;
    this.forget(key);
    const now = Date.now();
    const ttl = this.options.ttlOf?.(value) ?? (value === null ? this.options.missTtlMs : this.options.hitTtlMs);
    this.keep(key, {
      value,
      bytes,
      expires: now + ttl,
      readAt: now,
    });
    while (this.entries.size > this.options.maxEntries || this.bytes > this.options.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.forget(oldest);
    }
  }

  /** Adds an entry as the most recently used one. */
  private keep(key: string, entry: TEntry<T>): void {
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
  }

  /** Removes an entry, if there is one. */
  private forget(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.bytes -= entry.bytes;
  }
}
