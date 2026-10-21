import { asOpaque } from './type-assertions';

/** Exclusive Web Locks fixture: a callback owns its name until its promise settles. */
export function createTestWebLocks(): LockManager {
  const held = new Map<string, Promise<void>>();
  const request = async <T>(
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
    suppliedCallback?: (lock: Lock | null) => T | PromiseLike<T>,
  ): Promise<T> => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : suppliedCallback!;
    if (options.signal?.aborted) throw options.signal.reason;
    if (options.ifAvailable && held.has(name)) return callback(null);
    while (held.has(name)) await held.get(name);
    let release!: () => void;
    held.set(
      name,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    try {
      return await callback(asOpaque<Lock>({ name, mode: 'exclusive' }));
    } finally {
      held.delete(name);
      release();
    }
  };
  return asOpaque<LockManager>({ request });
}
