// TODO:[Locks] #2040 — staging-only gate for the Lock-auth manual-test hook
// (`window.locksdk.start()`). Kept as a staging test aid; delete before release.
//
// Every deployed build is a production build (`next build`, NODE_ENV=production) — staging and prod
// alike; only local `next dev`/tests are non-production. So NODE_ENV can't tell staging from prod;
// we check the hostname instead.
import { Env } from '@/libs/env/env';

/** Exact staging host where the temporary Lock-auth test hook is allowed. */
const STAGING_HOSTNAME = 'staging.pubky.app';
/** Substring marker for ephemeral PR-preview deploys (e.g. `pubky-app-pr-2137.…`). */
const EPHEMERAL_HOST_MARKER = 'pubky-app-pr-';

/**
 * Whether the temporary Lock-auth test trigger may run.
 *
 * Allowed: local dev/test builds, the staging deploy, and PR-preview deploys.
 * Fail-closed everywhere else — production, any unknown host, and SSR.
 */
export function isLocksAuthTestEnabled(): boolean {
  // Non-production = local `next dev` or tests only. Any deployed env (staging or prod) is a
  // production build, so it never enters here — it falls through to the hostname check below.
  if (Env.NODE_ENV !== 'production') return true;

  // Production build: enable only on staging / PR-preview hosts. No window → SSR → fail-closed.
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  return host === STAGING_HOSTNAME || host.includes(EPHEMERAL_HOST_MARKER);
}
