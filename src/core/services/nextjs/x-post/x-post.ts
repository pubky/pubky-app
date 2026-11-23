import type { Tweet } from 'react-tweet/api';
import { isXPostId } from '@/pipes/x-post/x-post';
import { readBodyBytes } from '../favicon/favicon.utils';
import { APP_USER_AGENT } from '../nextjs.utils';

/** The whole read of one post, the body included. */
export const X_POST_TIMEOUT_MS = 6_000;
/** The most bytes of X's answer read: one post's JSON is a few KB (a long thread's quoted post ~20 KB). */
export const X_POST_MAX_BYTES = 512 * 1024;

/** A read that may pass later: no answer in time, a failed connection, a 429 or 5xx, or an answer that is no post's JSON. */
export const X_POST_FAILED = 'failed';

/**
 * X's syndication host, as `react-tweet`'s server read asks it, with the same query: the address, the
 * `features` list and the token (`getToken`) are copied from `react-tweet` 3.3.1
 * (`dist/api/fetch-tweet.js`), so the app can cap the answer's bytes. Keep them in step with it when
 * `react-tweet` is upgraded.
 */
const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result';
const SYNDICATION_FEATURES = [
  'tfw_timeline_list:',
  'tfw_follower_count_sunset:true',
  'tfw_tweet_edit_backend:on',
  'tfw_refsrc_session:on',
  'tfw_fosnr_soft_interventions_enabled:on',
  'tfw_show_birdwatch_pivots_enabled:on',
  'tfw_show_business_verified_badge:on',
  'tfw_duplicate_scribes_to_settings:on',
  'tfw_use_profile_image_shape_enabled:on',
  'tfw_show_blue_verified_badge:on',
  'tfw_legacy_timeline_sunset:true',
  'tfw_show_gov_verified_badge:on',
  'tfw_show_business_affiliate_badge:on',
  'tfw_tweet_edit_frontend:on',
].join(';');

/** The token X's syndication host asks with a post's ID, as `react-tweet` makes it. */
function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
}

/** The one address a post is read from: X's syndication host, its ID and the fixed query. */
export function getXPostSource(id: string): string {
  const url = new URL(SYNDICATION_URL);
  url.searchParams.set('id', id);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('features', SYNDICATION_FEATURES);
  url.searchParams.set('token', getToken(id));
  return url.href;
}

/**
 * Next.js X post service: reads one X post for the `/api/x-post` route from X's syndication host
 * (`cdn.syndication.twimg.com`), at a fixed address made of the post's ID, as `react-tweet`'s server read
 * does. The app names itself (`APP_USER_AGENT`); nothing of the viewer's request is sent: no cookie,
 * credential, header or referrer. No redirect is followed, `X_POST_MAX_BYTES` read at most, and the read
 * ends after `X_POST_TIMEOUT_MS`.
 */
export class NextJsXPostService {
  private constructor() {}

  /**
   * The post `id` (`isXPostId`) as X answers it; `null` when X has no such post (deleted, withheld,
   * protected: a 404, an empty answer, a tombstone or any answer that is no post), refuses the ID (any
   * other client error) or for an ID that is not one; `X_POST_FAILED` when the read may pass later (no
   * answer in time, a failed connection, a 429 or 5xx, a body too large, or a 200 that is no JSON
   * object, as a challenge page).
   * Never throws.
   */
  static async fetch(id: string): Promise<Tweet | null | typeof X_POST_FAILED> {
    if (!isXPostId(id)) return null;
    let response: Response;
    try {
      response = await fetch(getXPostSource(id), {
        headers: { 'User-Agent': APP_USER_AGENT, Accept: 'application/json' },
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: AbortSignal.timeout(X_POST_TIMEOUT_MS),
      });
    } catch {
      return X_POST_FAILED;
    }
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      const failed = response.status === 429 || response.status >= 500;
      return failed ? X_POST_FAILED : null;
    }
    const bytes = await readBodyBytes(response, X_POST_MAX_BYTES);
    if (!bytes) return X_POST_FAILED;
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return X_POST_FAILED;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return X_POST_FAILED;
    // Anything but a post (an empty answer, a tombstone, another kind) is no post to show: an answer,
    // kept as such, never a failure that would pause X's reads for everyone.
    return '__typename' in data && data.__typename === 'Tweet' ? (data as Tweet) : null;
  }
}
