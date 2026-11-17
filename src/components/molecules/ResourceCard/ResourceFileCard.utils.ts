import type { NexusFileDetails } from '@/services/nexus/nexus.types';

/** What a pubky.app file is called where a resource shows its type, and its name when it has none. */
export const FILE_TYPE_LABEL = 'File';

/** Names what a file's tags are on: the tag list's name and the Tags button's tooltip. */
export const FILE_TAGS_LABEL = 'Tags on this file';

const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/**
 * A file size as people read it: bytes below 1 KB (`89 B`), else one decimal in the largest unit
 * of 1024 that keeps it at 1 or more (`48.2 KB`, `1.5 MB`), without a trailing `.0` (`2 MB`).
 * `null` for a size that is not a whole number of bytes, or is negative.
 */
export function formatFileSize(bytes: number): string | null {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  let rounded = Math.round(value * 10) / 10;
  // Just under the next unit rounds up to it: `1 MB`, never `1024 KB`.
  if (rounded >= 1024 && unit < SIZE_UNITS.length - 1) {
    rounded = 1;
    unit += 1;
  }
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${SIZE_UNITS[unit]}`;
}

/**
 * The line under a file's name: its type as Nexus gives it and its size (`text/plain · 89 B`), each
 * left out when unknown (v1 media has no size); `null` when neither is known.
 */
export function getFileDetailsLine(file: Pick<NexusFileDetails, 'content_type' | 'size'>): string | null {
  const parts = [file.content_type?.trim() || null, file.size > 0 ? formatFileSize(file.size) : null].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}
