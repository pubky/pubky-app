import { Container } from '@/atoms/Container/Container';
import { Iframe } from '@/atoms/Iframe/Iframe';
import { convertHmsToSeconds } from '@/libs/utils/utils';
import { HMS_TIMESTAMP_REGEX } from '@/libs/utils/utils.constants';
import { extractYouTubeVideoId, YOUTUBE_DOMAINS } from '@/libs/utils/videoUrl';
import { VIDEO_EMBED_PROPS } from '../Provider.constants';
import type { EmbedData, EmbedProvider } from '../Provider.types';

/**
 * Extract timestamp from YouTube URL and convert to seconds
 * Supports formats: 123s, 1h2m3s, 123 (plain number)
 */
const extractYouTubeTimestamp = (url: string): number | null => {
  try {
    const parsedUrl = new URL(url);
    const timeParam = parsedUrl.searchParams.get('t');
    if (!timeParam) return null;

    // Require at least one component using shared regex pattern
    const hmsMatch = timeParam.match(HMS_TIMESTAMP_REGEX);
    if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
      const timestamp = convertHmsToSeconds(hmsMatch[1], hmsMatch[2], hmsMatch[3]);
      // convertHmsToSeconds returns null if any value is NaN (defense in depth)
      if (timestamp !== null) return timestamp;
    }

    const numericMatch = timeParam.match(/^(\d+)s?$/);
    if (numericMatch) {
      const parsed = parseInt(numericMatch[1], 10);
      // Guard against NaN from parseInt (defense in depth)
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Extract video ID from YouTube embed URL for accessibility/debugging
 * Returns 'unknown' if extraction fails (should never happen with valid embed URLs)
 *
 * @param embedUrl - The YouTube embed URL
 * @returns The 11-character video ID or 'unknown' as fallback
 */
const extractVideoIdFromEmbedUrl = (embedUrl: string): string => {
  return embedUrl.match(/youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/)?.[1] || 'unknown';
};

/**
 * YouTube embed provider
 * Implements the standard EmbedProvider interface
 *
 * Domains and video id extraction are shared with post kind inference, so a link
 * that is stored as kind `video` is a link this provider plays.
 */
export const Youtube: EmbedProvider = {
  /**
   * List of supported YouTube domains
   */
  domains: YOUTUBE_DOMAINS,

  /**
   * Parse YouTube URL and return embed information
   */
  parseEmbed: (url: string): EmbedData | null => {
    const id = extractYouTubeVideoId(url);

    if (!id) return null;

    const timestamp = extractYouTubeTimestamp(url);
    // Only add start parameter if timestamp exists and is greater than 0
    // (starting at 0 is semantically identical to no start parameter)
    const embedUrl =
      timestamp && timestamp > 0
        ? `https://www.youtube-nocookie.com/embed/${id}?start=${timestamp}&enablejsapi=1`
        : `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1`;

    return { type: 'url', value: embedUrl };
  },

  /**
   * Render YouTube iframe embed with responsive aspect ratio wrapper
   * Matches Vimeo's rendering pattern for consistent 16:9 aspect ratio
   */
  renderEmbed: (embedData: EmbedData) => {
    // Type guard: ensure we have a URL type
    if (embedData.type !== 'url') return null;

    const embedUrl = embedData.value;
    const videoId = extractVideoIdFromEmbedUrl(embedUrl);

    return (
      <Container data-testid="youtube-aspect-ratio-wrapper" className="relative pt-[56.25%]">
        <Iframe
          {...VIDEO_EMBED_PROPS}
          sandbox={`${VIDEO_EMBED_PROPS.sandbox} allow-popups-to-escape-sandbox`}
          src={embedUrl}
          title={`YouTube video ${videoId}`}
          data-testid="YouTube video player"
          height="auto"
          className="absolute top-0 left-0 h-full w-full"
        />
      </Container>
    );
  },
};
