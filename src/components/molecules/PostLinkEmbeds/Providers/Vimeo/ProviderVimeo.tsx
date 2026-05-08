import { Container } from '@/atoms/Container/Container';
import { Iframe } from '@/atoms/Iframe/Iframe';
import { convertHmsToSeconds } from '@/libs/utils/utils';
import { HMS_TIMESTAMP_REGEX } from '@/libs/utils/utils.constants';
import { VIDEO_EMBED_PROPS } from '../Provider.constants';
import type { EmbedData, EmbedProvider } from '../Provider.types';

/**
 * Extract Vimeo video ID from URL
 * Vimeo uses purely numeric IDs (unlike YouTube's alphanumeric)
 *
 * @example
 * // Protocol-agnostic - works with or without http(s)://
 * extractVimeoId('https://vimeo.com/123456789') // → '123456789'
 * extractVimeoId('vimeo.com/123456789')         // → '123456789'
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
const extractVimeoId = (url: string): string | null => {
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
 * Extract timestamp from Vimeo URL
 * Vimeo uses hash fragment format: #t=XmYs or #t=Xs or #t=X (plain seconds)
 *
 * @security Regex Precision
 * The 's' suffix is optional but explicit (not inside capture group) to prevent
 * ambiguous matches like "30ss". Each time unit (h/m/s) can appear at most once.
 * Plain numbers (e.g., "30") are treated as seconds.
 */
const extractVimeoTimestamp = (url: string): number | null => {
  try {
    const parsedUrl = new URL(url);
    const timeHash = parsedUrl.hash.match(/#t=([^&\s]+)/)?.[1];
    if (!timeHash) return null;

    // Match h/m/s format using shared regex pattern
    // Supports: "1h2m3s", "5m", "30s", or plain "30" (treated as seconds)
    const hmsMatch = timeHash.match(HMS_TIMESTAMP_REGEX);
    if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
      const timestamp = convertHmsToSeconds(hmsMatch[1], hmsMatch[2], hmsMatch[3]);
      // convertHmsToSeconds returns null if any value is NaN (defense in depth)
      return timestamp;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Extract video ID from Vimeo embed URL for accessibility/debugging
 * Returns 'unknown' if extraction fails (should never happen with valid embed URLs)
 *
 * @param embedUrl - The Vimeo player embed URL
 * @returns The numeric video ID or 'unknown' as fallback
 */
const extractVideoIdFromEmbedUrl = (embedUrl: string): string => {
  return embedUrl.match(/player\.vimeo\.com\/video\/(\d+)/)?.[1] || 'unknown';
};

/**
 * Vimeo supported domains (lowercase)
 */
const VIMEO_DOMAINS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'] as const;

/**
 * Vimeo embed provider
 * Implements the standard EmbedProvider interface
 */
export const Vimeo: EmbedProvider = {
  /**
   * List of supported Vimeo domains
   */
  domains: VIMEO_DOMAINS,

  /**
   * Parse Vimeo URL and return embed information
   */
  parseEmbed: (url: string): EmbedData | null => {
    const id = extractVimeoId(url);

    if (!id) return null;

    const timestamp = extractVimeoTimestamp(url);
    const embedUrl = timestamp
      ? `https://player.vimeo.com/video/${id}#t=${timestamp}s`
      : `https://player.vimeo.com/video/${id}`;

    return { type: 'url', value: embedUrl };
  },

  /**
   * Render Vimeo iframe embed with responsive aspect ratio wrapper
   * Following Vimeo's official embed pattern
   */
  renderEmbed: (embedData: EmbedData) => {
    // Type guard: ensure we have a URL type
    if (embedData.type !== 'url') return null;

    const embedUrl = embedData.value;
    const videoId = extractVideoIdFromEmbedUrl(embedUrl);

    return (
      <Container data-testid="vimeo-aspect-ratio-wrapper" className="relative pt-[56.25%]">
        <Iframe
          {...VIDEO_EMBED_PROPS}
          sandbox={`${VIDEO_EMBED_PROPS.sandbox} allow-popups-to-escape-sandbox`}
          src={embedUrl}
          title={`Vimeo video ${videoId}`}
          data-testid="Vimeo video player"
          height="auto"
          className="absolute top-0 left-0 h-full w-full"
        />
      </Container>
    );
  },
};
