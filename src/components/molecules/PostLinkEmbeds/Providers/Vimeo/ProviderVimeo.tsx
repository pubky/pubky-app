import { Container } from '@/atoms/Container/Container';
import { Iframe } from '@/atoms/Iframe/Iframe';
import { convertHmsToSeconds } from '@/libs/utils/utils';
import { HMS_TIMESTAMP_REGEX } from '@/libs/utils/utils.constants';
import { extractVimeoVideoId, VIMEO_DOMAINS } from '@/libs/utils/videoUrl';
import { VIDEO_EMBED_PROPS } from '../Provider.constants';
import type { EmbedData, EmbedProvider } from '../Provider.types';

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
 * Vimeo embed provider
 * Implements the standard EmbedProvider interface
 *
 * Domains and video id extraction are shared with post kind inference, so a link
 * that is stored as kind `video` is a link this provider plays.
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
    const id = extractVimeoVideoId(url);

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
