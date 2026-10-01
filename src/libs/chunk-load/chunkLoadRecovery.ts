import { APP_VERSION } from '@/config/app';

/**
 * Recovery for lazily loaded chunks that a stale build no longer serves.
 *
 * A tab left open across a deploy keeps the previous build's asset manifest, so a chunk it
 * lazily requests (a route segment, a `next/dynamic` component, the icon catalog) can be
 * missing from the new deployment and fail with `ChunkLoadError` / `Loading chunk <id> failed`.
 * Next.js surfaces that as a render error, so the nearest error boundary takes over; reloading
 * the tab fetches the current build, where the chunk exists again.
 *
 * The reload is claimed at most once per build per session. The guard stores the `APP_VERSION`
 * of the build that failed, so:
 * - a genuinely broken build (the chunk is missing from the deployed artifact too) reloads once,
 *   fails again and stays on the terminal error UI instead of looping;
 * - a tab that survived a second deploy can recover again, because the stored build differs from
 *   the one now running;
 * - when `sessionStorage` is unavailable (private mode, disabled storage) nothing is written and
 *   no reload happens: without a durable guard the reload could loop forever.
 */
export const CHUNK_LOAD_RECOVERY_STORAGE_KEY = 'pubky-app:chunk-load-recovery';

/** Reads a string property without assuming the shape of a thrown value. */
function readStringProperty(value: object, key: 'name' | 'message'): string | undefined {
  const property: unknown = Reflect.get(value, key);
  return typeof property === 'string' ? property : undefined;
}

/**
 * Whether a render error is a failed lazy chunk load.
 *
 * Webpack's chunk loaders set `name = 'ChunkLoadError'` and `message = 'Loading chunk <id> failed.'`
 * (`Loading CSS chunk <id> failed.` for stylesheets). The id is numeric for route chunks but a name
 * for named ones, so match the shape of the message rather than a specific id. The message is not
 * anchored because a wrapper can prefix it (for example `ChunkLoadError: Loading chunk 42 failed.`).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (readStringProperty(error, 'name') === 'ChunkLoadError') {
    return true;
  }

  const message = readStringProperty(error, 'message');
  return message !== undefined && /Loading (CSS )?chunk .+ failed/.test(message);
}

/**
 * Claims the one recovery reload for the build that is running.
 *
 * Returns true only when the caller should reload the page: `sessionStorage` accepted the guard
 * write and the stored build differs from the running one. Every other path returns false, so the
 * error boundary keeps rendering its terminal error state (unavailable storage, second failure of
 * the same build, server render).
 */
export function claimStaleChunkReload(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    if (sessionStorage.getItem(CHUNK_LOAD_RECOVERY_STORAGE_KEY) === APP_VERSION) {
      return false;
    }
    sessionStorage.setItem(CHUNK_LOAD_RECOVERY_STORAGE_KEY, APP_VERSION);
    return true;
  } catch {
    // Private mode / disabled storage: without a durable guard a reload could loop forever.
    return false;
  }
}
