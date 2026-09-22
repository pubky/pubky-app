/**
 * Detects whether a URL points at a video, for post kind inference.
 *
 * A post's kind decides which Content filter and layout it lands in, so a link
 * that renders a video embed (or a direct video file) belongs in `video` rather
 * than `link`. Only the URL shape is available here: the OpenGraph route decides
 * `type: 'video'` from the response `content-type`, which needs a network call
 * the pipes must not make.
 *
 * The host list mirrors the video providers registered in `PostLinkEmbeds`
 * (YouTube, Vimeo). When a provider is added there, add its hosts here too, so
 * classification and rendering cannot disagree.
 */

/** Hosts whose links render a video embed. Compared after stripping a leading `www.`. */
const VIDEO_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
]);

/** Extensions of direct video files, which the generic preview renders inline. */
const VIDEO_FILE_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

const SCHEME_PREFIX_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Parses an absolute or protocol-less URL. Protocol-less values (which linkify-it
 * can produce) are resolved against https so host and path can be compared.
 */
const parseUrl = (value: string): URL | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(SCHEME_PREFIX_REGEX.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
};

/** Returns true when the URL is an http(s) video link or a direct video file. */
export function isVideoUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (VIDEO_HOSTS.has(hostname)) return true;

  const pathname = url.pathname.toLowerCase();
  return VIDEO_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}
