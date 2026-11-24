import { LOCK_ATTACHMENT_MAX_FILES, LOCK_ATTACHMENT_MAX_SIZE } from '@/config/posts';

/** Sizes are the raw files': a lock uploads them as they are, with no compression. */
export function areLockAttachmentsWithinLimit(files: readonly File[]): boolean {
  return files.length <= LOCK_ATTACHMENT_MAX_FILES && files.every((file) => file.size <= LOCK_ATTACHMENT_MAX_SIZE);
}
