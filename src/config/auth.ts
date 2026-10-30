import type { Capabilities } from '@synonymdev/pubky';
import { LOCKS_GUARDED_CONTENT_PATH } from '@/config/locks';

export { getAuthClientId } from '@/libs/runtime-config/runtime-config';

/**
 * The 0.x public tree. Kept after the social v1 migration: deleting a migrated object still
 * reaches its 0.x copy, and the migrator lists the tree under this scope (`MIGRATION_CAPS`).
 */
export const APP_CAPABILITIES = '/pub/pubky.app/:rw' satisfies Capabilities;

/**
 * The social v1 trees and the app's own private namespace (settings, notification read cursor),
 * requested beside `APP_CAPABILITIES` by every grant. Explicit, not inherited from the Locks
 * `/priv/social/:rw` entry: the migration grant is checked against `MIGRATION_CAPS` entry by entry.
 */
export const SOCIAL_V1_APP_CAPABILITIES = [
  '/pub/social/v1/:rw',
  '/priv/social/v1/:rw',
  '/priv/app.pubky/v1/:rw',
] as const satisfies readonly Capabilities[];

/** Additional scopes requested when Locks is used and current permissions are insufficient. */
export const LOCKS_CAPABILITIES = [
  '/priv/social/:rw',
  `${LOCKS_GUARDED_CONTENT_PATH}:r`,
] as const satisfies readonly Capabilities[];

/** Shared App/Shop storage. Encryption-key permissions are a separate feature. */
export const SHOP_CAPABILITIES = [
  APP_CAPABILITIES,
  '/pub/paykit/:rw',
  '/priv/pubky.app/:rw',
  '/pub/chat/v0/:rw',
  '/priv/chat/v0/:rw',
] as const satisfies readonly Capabilities[];
