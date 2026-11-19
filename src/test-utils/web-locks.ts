import { asOpaque } from './type-assertions';

type Holder = { mode: LockMode };
type Waiter = { holder: Holder; grant: () => void };

/**
 * Web Locks fixture with the browser's grant rules: `shared` holders of a name overlap, an `exclusive`
 * holder (the default mode, as in the browser) owns the name alone, and requests are granted in order,
 * so a request queued behind a waiting one waits too. `ifAvailable` runs the callback with `null`
 * instead of waiting; `query` lists the held and the pending names with their modes.
 */
export function createTestWebLocks(): LockManager {
  const holders = new Map<string, Set<Holder>>();
  const waiters = new Map<string, Waiter[]>();
  const holdersOf = (name: string) => {
    let held = holders.get(name);
    if (!held) holders.set(name, (held = new Set()));
    return held;
  };
  const waitersOf = (name: string) => {
    let queue = waiters.get(name);
    if (!queue) waiters.set(name, (queue = []));
    return queue;
  };
  /** Whether a request in `mode` can hold `name` beside its current holders. */
  const compatible = (name: string, mode: LockMode) => {
    const held = holdersOf(name);
    if (held.size === 0) return true;
    return mode === 'shared' && [...held].every((holder) => holder.mode === 'shared');
  };
  /** Grants the queued requests of `name` in order, as far as its holders allow. */
  const grantWaiting = (name: string) => {
    const queue = waitersOf(name);
    while (queue.length > 0 && compatible(name, queue[0].holder.mode)) {
      const next = queue.shift()!;
      holdersOf(name).add(next.holder);
      next.grant();
    }
  };
  const request = async <T>(
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
    suppliedCallback?: (lock: Lock | null) => T | PromiseLike<T>,
  ): Promise<T> => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : suppliedCallback!;
    if (options.signal?.aborted) throw options.signal.reason;
    const mode: LockMode = options.mode ?? 'exclusive';
    const queue = waitersOf(name);
    const grantedNow = queue.length === 0 && compatible(name, mode);
    if (options.ifAvailable && !grantedNow) return callback(null);
    const holder: Holder = { mode };
    if (grantedNow) holdersOf(name).add(holder);
    else await new Promise<void>((grant) => queue.push({ holder, grant }));
    try {
      return await callback(asOpaque<Lock>({ name, mode }));
    } finally {
      holdersOf(name).delete(holder);
      grantWaiting(name);
    }
  };
  const query = async (): Promise<LockManagerSnapshot> => ({
    held: [...holders].flatMap(([name, held]) => [...held].map(({ mode }) => ({ name, mode, clientId: 'test' }))),
    pending: [...waiters].flatMap(([name, queue]) =>
      queue.map(({ holder }) => ({ name, mode: holder.mode, clientId: 'test' })),
    ),
  });
  return asOpaque<LockManager>({ request, query });
}
