import type { Capabilities } from '@synonymdev/pubky';

/** Ordinary Ring login requests only the app's public storage. */
export const APP_CAPABILITIES = '/pub/pubky.app/:rw' satisfies Capabilities;

/** Additional scopes requested when Locks is used and current permissions are insufficient. */
// Exported for integration tests and the separate Locks feature branch.
export const LOCKS_CAPABILITIES = ['/priv/social/:rw', '/priv/locks.app/:r'] as const satisfies readonly Capabilities[];
