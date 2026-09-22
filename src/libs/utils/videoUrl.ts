/**
 * Video link classification, shared by post kind inference and the link embed providers.
 *
 * `isVideoUrl` decides whether a link post is stored as `PubkyAppPostKind.Video`
 * instead of `Link`, which is what the Content filters select on. It has to agree
 * with what the embed actually plays, so the provider domains and the video id
 * extraction live here and the YouTube/Vimeo providers import them. Adding a
 * provider means adding its domains and its extractor here, and classification
 * and rendering move together.
 *
 * The kind is a single value: a post is `video` or `link`, never both.
 */

/**
 * Extract YouTube video ID from URL
 * Validates that ID is exactly 11 characters with valid characters only
 *
 * @example
 * // Protocol-agnostic - works with or without http(s)://
 * extractYouTubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ') // → 'dQw4w9WgXcQ'
 * extractYouTubeVideoId('youtube.com/watch?v=dQw4w9WgXcQ')         // → 'dQw4w9WgXcQ'
 * extractYouTubeVideoId('youtu.be/dQw4w9WgXcQ')                    // → 'dQw4w9WgXcQ'
 */
export const extractYouTubeVideoId = (url: string): string | null => {
  // Normalize URL to lowercase for case-insensitive domain matching
  // But preserve original for video ID extraction (video IDs are case-sensitive)
  const normalizedUrl = url.toLowerCase();

  // Protocol-agnostic patterns - matches with or without http(s)://
  // Use word boundaries or specific delimiters to ensure exactly 11 characters
  // Support hash fragments (#) as valid boundaries
  const patterns = [
    // Standard watch: youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})(?:[&#\s]|$)/,
    // Short URL: youtu.be/VIDEO_ID
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#\s]|$)/,
    // Embed: youtube.com/embed/* or youtube-nocookie.com/embed/*
    /(?:youtube(?:-nocookie)?\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[?&#\s]|$)/,
    // Shorts: youtube.com/shorts/VIDEO_ID
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:[?&#\s]|$)/,
    // Live streams: youtube.com/live/VIDEO_ID
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})(?:[?&#\s]|$)/,
    // Music subdomain: music.youtube.com/watch?v=VIDEO_ID
    /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})(?:[&#\s]|$)/,
    // Old embed: youtube.com/v/VIDEO_ID (legacy)
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:[?&#\s]|$)/,
  ];

  // Match against normalized URL for case-insensitive domain matching
  for (const pattern of patterns) {
    const match = normalizedUrl.match(pattern);
    if (match) {
      // Extract video ID from the SAME position in original URL to preserve case
      const idStartIndex = match.index! + match[0].indexOf(match[1]);
      const id = url.substring(idStartIndex, idStartIndex + 11);

      // Validate video ID format
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  }

  return null;
};

/**
 * YouTube supported domains (lowercase)
 */
export const YOUTUBE_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
] as const;

/**
 * Extract Vimeo video ID from URL
 * Vimeo uses purely numeric IDs (unlike YouTube's alphanumeric)
 *
 * @example
 * // Protocol-agnostic - works with or without http(s)://
 * extractVimeoVideoId('https://vimeo.com/123456789') // → '123456789'
 * extractVimeoVideoId('vimeo.com/123456789')         // → '123456789'
 *
 * @security Regex Denial of Service (ReDoS) Prevention
 *
 * This function uses security-hardened regex patterns to prevent catastrophic
 * backtracking attacks. Key protections:
 *
 * 1. **Bounded Repetition**: Channel/group names limited to {1,100} characters
 *    instead of unbounded [^/]+ which could cause exponential backtracking
 *
 * 2. **Character Class Restrictions**: Uses [a-z0-9_-] instead of [^/] to
 *    limit valid characters and prevent edge cases
 *
 * 3. **Explicit Anchoring**: All patterns end with (?:[?#\s]|$) to ensure
 *    proper termination and prevent runaway matching
 *
 * 4. **Performance**: Guaranteed to complete in <100ms even with malicious
 *    input containing 1000+ characters (validated in tests)
 *
 * @see ProviderVimeo.test.ts - "regex catastrophic backtracking prevention"
 */
export const extractVimeoVideoId = (url: string): string | null => {
  // Protocol-agnostic, security-hardened patterns - matches with or without http(s)://
  const patterns = [
    // Standard: vimeo.com/VIDEO_ID (with word boundary or end/query marker)
    /vimeo\.com\/(\d+)(?:[?#\s]|$)/,
    // Player: player.vimeo.com/video/VIDEO_ID
    /player\.vimeo\.com\/video\/(\d+)(?:[?#\s]|$)/,
    // Channels: vimeo.com/channels/CHANNEL_NAME/VIDEO_ID (limit channel name length)
    /vimeo\.com\/channels\/([a-z0-9_-]{1,100})\/(\d+)(?:[?#\s]|$)/i,
    // Groups: vimeo.com/groups/GROUP_NAME/videos/VIDEO_ID (limit group name length)
    /vimeo\.com\/groups\/([a-z0-9_-]{1,100})\/videos\/(\d+)(?:[?#\s]|$)/i,
    // Album: vimeo.com/album/ALBUM_ID/video/VIDEO_ID
    /vimeo\.com\/album\/(\d+)\/video\/(\d+)(?:[?#\s]|$)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      // Get last capturing group (always the video ID)
      const id = match[match.length - 1];
      if (id && /^\d+$/.test(id)) return id;
    }
  }

  return null;
};

/**
 * Vimeo supported domains (lowercase)
 */
export const VIMEO_DOMAINS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'] as const;

/**
 * Extensions of direct video files. The generic preview renders these inline as a
 * video, because the OpenGraph route reports their content type.
 */
const VIDEO_FILE_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'] as const;

const SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Parses a URL, tolerating a missing scheme the way linkify-it does.
 * Returns null when the value cannot be parsed as an absolute http(s) URL.
 */
const parseHttpUrl = (value: string): URL | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(SCHEME_REGEX.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

/**
 * True when the URL is one a video embed provider plays, or a direct video file.
 *
 * The hostname is matched against the same domain lists the providers register,
 * then the provider's own id extraction decides. A channel, playlist or about
 * page on a video host has no id and stays a link.
 */
export function isVideoUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;

  const hostname = url.hostname.toLowerCase();

  if ((YOUTUBE_DOMAINS as readonly string[]).includes(hostname)) {
    return extractYouTubeVideoId(value.trim()) !== null;
  }

  if ((VIMEO_DOMAINS as readonly string[]).includes(hostname)) {
    return extractVimeoVideoId(value.trim()) !== null;
  }

  const pathname = url.pathname.toLowerCase();
  return VIDEO_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}
