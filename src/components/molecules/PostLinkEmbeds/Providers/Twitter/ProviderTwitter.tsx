import { useEffect, useRef } from 'react';
import { EmbeddedTweet, TweetNotFound, TweetSkeleton, useTweet } from 'react-tweet';
import type { Tweet, TweetEntities } from 'react-tweet/api';
import { Container } from '@/atoms/Container/Container';
import type { EmbedData, EmbedProvider } from '../Provider.types';

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
 * TEMPORARY WORKAROUND: Normalizes a tweet's `entities` before rendering.
 *
 * The Twitter syndication API sometimes returns `entities` containing only
 * `media`, omitting `hashtags` / `user_mentions` / `urls` / `symbols`.
 * react-tweet's `getEntities` iterates those four arrays with no guard, so a
 * missing one throws `TypeError: <x> is not iterable` and crashes the page.
 *
 * This fills the missing arrays with `[]` (for the tweet and any quoted tweet)
 * before the data reaches `EmbeddedTweet`.
 *
 * Remove this entire workaround — `withEntityDefaults`, `normalizeTweet`,
 * `NormalizedTweet` — and go back to react-tweet's `<Tweet id={...} />` once
 * https://github.com/vercel/react-tweet/issues/218 is fixed and released.
 */
// `entities` is typed as a complete `TweetEntities`, but the syndication API
// can omit fields at runtime — hence `Partial` so the defaults below survive.
//
// Only the four arrays that `getEntities` iterates unguarded are defaulted.
// `media` is deliberately NOT defaulted: react-tweet guards it with
// `if (tweet.entities.media)` and `fixRange` reads `media[0].indices`, so an
// empty `[]` would pass the truthy check and then crash on `media[0]`. A
// missing `media` must stay missing.
const withEntityDefaults = (entities: Partial<TweetEntities> | undefined): TweetEntities => ({
  hashtags: [],
  urls: [],
  user_mentions: [],
  symbols: [],
  ...entities,
});

const normalizeTweet = (tweet: Tweet): Tweet => ({
  ...tweet,
  entities: withEntityDefaults(tweet.entities),
  ...(tweet.quoted_tweet && {
    quoted_tweet: {
      ...tweet.quoted_tweet,
      entities: withEntityDefaults(tweet.quoted_tweet.entities),
    },
  }),
});

/**
 * Drop-in replacement for react-tweet's `<Tweet id={...} />` that normalizes
 * entities before rendering. Mirrors the original loading / error / content
 * states. Part of the TEMPORARY WORKAROUND above.
 */
const NormalizedTweet = ({ tweetId }: { tweetId: string }) => {
  const { data, error, isLoading } = useTweet(tweetId);

  if (isLoading) return <TweetSkeleton />;
  if (error || !data) return <TweetNotFound error={error} />;

  return <EmbeddedTweet tweet={normalizeTweet(data)} />;
};

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
    <Container
      ref={containerRef}
      data-testid="twitter-container"
      data-theme="dark"
      className="mx-0 max-w-70 sm:mx-auto sm:max-w-none [&_.react-tweet-theme]:m-0! [&_.tweet-media\_root\_\_k6gQ2]:max-h-75! [&_.tweet-media\_root\_\_k6gQ2]:overflow-y-auto!"
    >
      <NormalizedTweet tweetId={tweetId} />
    </Container>
  );
};

/**
 * Twitter/X embed provider
 * Implements the standard EmbedProvider interface
 */
export const Twitter: EmbedProvider = {
  /**
   * List of supported Twitter/X domains
   */
  domains: TWITTER_DOMAINS,

  /**
   * Parse Twitter/X URL and return embed information
   */
  parseEmbed: (url: string): EmbedData | null => {
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
  renderEmbed: (embedData: EmbedData) => {
    // Type guard: ensure we have an ID type
    if (embedData.type !== 'id') return null;

    const tweetId = embedData.value;
    const tweetUrl = `https://x.com/i/status/${tweetId}`;

    return <TwitterEmbed tweetId={tweetId} tweetUrl={tweetUrl} />;
  },
};
