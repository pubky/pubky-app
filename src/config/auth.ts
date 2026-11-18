import type { Capabilities } from '@synonymdev/pubky';
import { LOCKS_GUARDED_CONTENT_PATH } from '@/config/locks';

export { getAuthClientId } from '@/libs/runtime-config/runtime-config';

/** Public storage required by the core app. Ring requests also include the merged Locks scopes. */
export const APP_CAPABILITIES = '/pub/pubky.app/:rw' satisfies Capabilities;

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
