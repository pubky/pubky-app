import { LOCK_ATTACHMENT_MAX_FILES, LOCK_ATTACHMENT_MAX_SIZE } from '@/config/posts';

/** Sizes are the raw files': a lock uploads them as they are, with no compression. */
export function areLockAttachmentsWithinLimit(files: readonly File[]): boolean {
  return files.length <= LOCK_ATTACHMENT_MAX_FILES && files.every((file) => file.size <= LOCK_ATTACHMENT_MAX_SIZE);
}

/**
 * TODO:[Locks] #2683 — temporary. A locked SVG is stored without its image type, so the buyer never
 * sees it after unlocking. Remove with the switch guard that calls this.
 */
export function hasSvgAttachment(files: readonly File[]): boolean {
  return files.some((file) => file.type === 'image/svg+xml');
}
