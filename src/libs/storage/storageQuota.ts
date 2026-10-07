import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';

/**
 * Copy for a homeserver 507 Insufficient Storage: the account's storage quota is full, so the
 * write is refused and retrying cannot help. There is no self-serve way to raise the quota yet,
 * so the message points at support (issue #1776).
 */
export const STORAGE_QUOTA_REACHED_MESSAGE =
  'You have reached your storage limit. Contact support to request more space.';

/**
 * Resolves a storage-quota toast message, or `null` when the error is unrelated.
 *
 * The homeserver answers 507 when a write would exceed the account quota; the status reaches the
 * app as `AppError.context.statusCode`.
 */
export function getStorageQuotaToastMessage(error: unknown): string | null {
  return hasHttpStatus(error, HttpStatusCode.INSUFFICIENT_STORAGE) ? STORAGE_QUOTA_REACHED_MESSAGE : null;
}
