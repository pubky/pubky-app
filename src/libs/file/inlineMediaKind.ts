/**
 * Media kinds an article body can embed inline. Images, videos, audio files and PDFs all use
 * markdown image syntax (`![alt](src)`); the kind is a rendering decision made from the file's
 * content type or, for an external URL, from its file extension.
 */
export type InlineMediaKind = 'image' | 'video' | 'audio' | 'pdf';

export const INLINE_MEDIA_KINDS: readonly InlineMediaKind[] = ['image', 'video', 'audio', 'pdf'];

/** Media kinds that are not images: the ones a reader must route away from `<img>`. */
export type InlineNonImageMediaKind = Exclude<InlineMediaKind, 'image'>;

/** Runtime check for data that crosses a trust boundary, such as an editor node pasted as JSON. */
export function isInlineNonImageMediaKind(value: unknown): value is InlineNonImageMediaKind {
  return value === 'video' || value === 'audio' || value === 'pdf';
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mpeg', 'mpg', 'webm', 'mov', 'm4v', 'ogv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'oga', 'flac']);
const PDF_EXTENSIONS = new Set(['pdf']);

/** Maps a MIME type to the inline media kind that renders it, or null for anything unsupported. */
export function getInlineMediaKindFromMime(mime: string | null | undefined): InlineMediaKind | null {
  if (!mime) return null;
  const normalized = mime.trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized === 'application/pdf') return 'pdf';
  return null;
}

/** The file name an external `https:` URL ends in (its last path segment, decoded), or null. */
export function fileNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const lastSegment = parsed.pathname.split('/').pop() ?? '';
  if (!lastSegment) return null;
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

/**
 * Classifies an external `https:` URL by the file extension of its pathname. Only direct file
 * links qualify (no YouTube/Vimeo page URLs); query strings and fragments never count, and an
 * unknown or missing extension returns null so the caller keeps today's image behaviour.
 * Never returns `'image'`: external images keep their existing path.
 */
export function inferMediaKindFromUrl(url: string | null | undefined): InlineNonImageMediaKind | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const lastSegment = parsed.pathname.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0 || dot === lastSegment.length - 1) return null;
  const extension = lastSegment.slice(dot + 1).toLowerCase();

  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  return null;
}
