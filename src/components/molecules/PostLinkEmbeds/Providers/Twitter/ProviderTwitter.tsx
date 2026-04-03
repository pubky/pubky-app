import { useEffect, useRef } from 'react';
import * as Atoms from '@/atoms';
import * as ProviderTypes from '../Provider.types';
import { Tweet } from 'react-tweet';

/**
 * Extract Twitter/X post ID from URL
 * Validates that ID contains only numeric characters
 *
 * @example
 * // Works with or without protocol:
 * extractTwitterId('https://twitter.com/user/status/123') // → '123'
 * extractTwitterId('twitter.com/user/status/123')         // → '123'
 * extractTwitterId('www.twitter.com/user/status/123')     // → '123'
 */
const extractTwitterId = (url: string): string | null => {
  // Protocol-agnostic patterns - matches with or without http(s)://
  const patterns = [
    // Standard tweet: twitter.com/username/status/ID or x.com/username/status/ID
    /(?:(?:twitter|x)\.com\/[^\/]+\/status\/)(\d+)(?:[?&#\/\s]|$)/,
    // Mobile: mobile.twitter.com/username/status/ID or mobile.x.com/username/status/ID
    /(?:mobile\.(?:twitter|x)\.com\/[^\/]+\/status\/)(\d+)(?:[?&#\/\s]|$)/,
  ];

  for (const pattern of patterns) {
    const id = url.match(pattern)?.[1];
    if (id && /^\d+$/.test(id)) return id;
  }

  return null;
};

/**
 * Twitter/X supported domains (lowercase)
 */
const TWITTER_DOMAINS = [
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'mobile.twitter.com',
  'mobile.x.com',
] as const;

/**
 * TEMPORARY WORKAROUND: Intercepts clicks on the video area and redirects to X.
 * Twitter CDN blocks video playback from external sites (403 Forbidden).
 * Remove this once react-tweet provides an upstream fix.
 * See: https://github.com/vercel/react-tweet/issues/212
 */
const TwitterEmbed = ({ tweetId, tweetUrl }: { tweetId: string; tweetUrl: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // Intercept video clicks before react-tweet's handler fires via stopImmediatePropagation
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('video') ||
        target.closest('button[aria-label="View video on X"]') ||
        target.closest('[class^="tweet-media-video-module"]')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // noopener: prevents the opened page from accessing window.opener
        // noreferrer: avoids sending Referer header to X
        window.open(tweetUrl, '_blank', 'noopener,noreferrer');
      }
    };

    node.addEventListener('click', handler);
    return () => node.removeEventListener('click', handler);
  }, [tweetUrl]);

  return (
    <Atoms.Container
      ref={containerRef}
      data-testid="twitter-container"
      data-theme="dark"
      className="mx-0 max-w-70 sm:mx-auto sm:max-w-none [&_.react-tweet-theme]:m-0! [&_.tweet-media\_root\_\_k6gQ2]:max-h-75! [&_.tweet-media\_root\_\_k6gQ2]:overflow-y-auto!"
    >
      <Tweet id={tweetId} />
    </Atoms.Container>
  );
};

/**
 * Twitter/X embed provider
 * Implements the standard EmbedProvider interface
 */
export const Twitter: ProviderTypes.EmbedProvider = {
  /**
   * List of supported Twitter/X domains
   */
  domains: TWITTER_DOMAINS,

  /**
   * Parse Twitter/X URL and return embed information
   */
  parseEmbed: (url: string): ProviderTypes.EmbedData | null => {
    const id = extractTwitterId(url);

    if (!id) return null;

    return { type: 'id', value: id };
  },

  /**
   * Render Twitter/X component embed using Twitter post ID
   *
   * Note: The selector `.tweet-media_root__k6gQ2` targets a CSS modules class
   * from react-tweet. The hash suffix may change in library updates - verify
   * styling after upgrading react-tweet package.
   */
  renderEmbed: (embedData: ProviderTypes.EmbedData) => {
    // Type guard: ensure we have an ID type
    if (embedData.type !== 'id') return null;

    const tweetId = embedData.value;
    const tweetUrl = `https://x.com/i/status/${tweetId}`;

    return <TwitterEmbed tweetId={tweetId} tweetUrl={tweetUrl} />;
  },
};
