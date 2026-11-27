type TWaiter = { grant: (release: (() => void) | null) => void; timer: ReturnType<typeof setTimeout> };
type TKeySlots = { active: number; waiters: TWaiter[] };

/**
 * At most `perKey` holders at once per key (the image route's reads per image host), so one slow key
 * cannot hold every read of a shared pool. A new holder waits up to `waitMs` for a slot, else gets none.
 */
export class KeyedSlots {
  private readonly keys = new Map<string, TKeySlots>();

  constructor(private readonly perKey: number) {}

  /**
   * A slot for `key`, given back by calling the returned function, or `null` when none came within
   * `waitMs` or `signal` aborted the wait: a waiter given up on leaves the queue, so no slot is ever
   * handed to it.
   */
  acquire(key: string, waitMs: number, signal?: AbortSignal): Promise<(() => void) | null> {
    if (signal?.aborted) return Promise.resolve(null);
    const slots = this.keys.get(key) ?? { active: 0, waiters: [] };
    this.keys.set(key, slots);
    if (slots.active < this.perKey) {
      slots.active += 1;
      return Promise.resolve(this.releaser(key, slots));
    }
    return new Promise((resolve) => {
      const giveUp = () => {
        const index = slots.waiters.indexOf(waiter);
        if (index !== -1) slots.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        signal?.removeEventListener('abort', giveUp);
        resolve(null);
      };
      const waiter: TWaiter = {
        grant: (release) => {
          signal?.removeEventListener('abort', giveUp);
          resolve(release);
        },
        timer: setTimeout(giveUp, waitMs),
      };
      slots.waiters.push(waiter);
      signal?.addEventListener('abort', giveUp, { once: true });
    });
  }

  /** How many holders `key` has now (tests). */
  holders(key: string): number {
    return this.keys.get(key)?.active ?? 0;
  }

  /** Forgets every slot and waiter (tests). */
  clear(): void {
    for (const slots of this.keys.values()) for (const waiter of slots.waiters) clearTimeout(waiter.timer);
    this.keys.clear();
  }

  private releaser(key: string, slots: TKeySlots): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = slots.waiters.shift();
      if (next) {
        // The slot passes straight to the first waiter.
        clearTimeout(next.timer);
        next.grant(this.releaser(key, slots));
        return;
      }
      slots.active -= 1;
      if (slots.active === 0 && this.keys.get(key) === slots) this.keys.delete(key);
    };
  }
}
