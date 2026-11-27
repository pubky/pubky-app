import { toXPost, type TXPost } from '@/pipes/x-post/x-post';
import { NextJsXPostService, X_POST_FAILED } from '@/services/nextjs/x-post/x-post';
import { BOUNDED_READ_BUSY, BoundedReadCache } from '@/utils/bounded-cache';
import { TokenBucket } from '@/utils/token-bucket';

/** The answer while the route's budget or reads are spent: nothing read now, nothing remembered. */
export const X_POST_BUSY = 'busy';
/** The answer when X could not be read for now (a timeout, an error answer): nothing remembered. */
export const X_POST_UNAVAILABLE = 'unavailable';

/** An X post, `null` when X has none, `X_POST_BUSY` or `X_POST_UNAVAILABLE`. */
export type TXPostRead = TXPost | null | typeof X_POST_BUSY | typeof X_POST_UNAVAILABLE;

/** Posts kept in memory at most (each a few KB at most: text and a few addresses). */
export const X_POST_ENTRIES = 1024;
/** Bytes of posts kept in memory at most. */
export const X_POST_CACHE_BYTES = 4 * 1024 * 1024;
/** Reads of X running at once at most. */
export const X_POST_MAX_IN_FLIGHT = 8;
/**
 * This server instance's budget of reads of X, all viewers together: 30 at once, one a second after
 * that. Past it, or while X is paused, a post not kept answers busy.
 */
export const X_POST_BURST = 30;
export const X_POST_PER_SECOND = 1;
/** How long X is not asked after a read failed (it may be rate limiting the server). */
export const X_POST_PAUSE_MS = 30 * 1000;
/** How long a post is kept: its text and media rarely change. */
const X_POST_TTL_MS = 60 * 60 * 1000;
/** How long X having no such post is remembered. */
const X_POST_MISS_TTL_MS = 10 * 60 * 1000;

type TNotNow = typeof X_POST_BUSY | typeof X_POST_UNAVAILABLE;
const isNotNow = (value: unknown): value is TNotNow => value === X_POST_BUSY || value === X_POST_UNAVAILABLE;

/**
 * X post application service: one X post for the `/api/x-post` route and the image route's `?xpost=`,
 * so a viewer's browser shows an X post a Pinakes card cannot tell (none, or one without its text)
 * without asking X. The post is read on the server (`NextJsXPostService`) and only what the app shows is
 * kept (`toXPost`: text, author, date, the media's addresses on X's media host).
 *
 * Posts are kept an hour (X having none, ten minutes) in a cache bounded by entries and bytes
 * (`BoundedReadCache`); concurrent requests for one post share one read, at most `X_POST_MAX_IN_FLIGHT`
 * run at once, and reads come from this instance's budget (`X_POST_BURST`). After a read fails, X is not
 * asked for `X_POST_PAUSE_MS`; a read not made now answers with the post kept before, expired or not,
 * else busy or unavailable, never remembered.
 */
export class XPostApplication {
  private constructor() {}

  private static readonly budget = new TokenBucket(X_POST_BURST, X_POST_PER_SECOND);
  /** Until when (epoch ms) X is not asked: a read failed. */
  private static pausedUntil = 0;
  private static readonly posts = new BoundedReadCache<TXPost | TNotNow>({
    maxEntries: X_POST_ENTRIES,
    maxBytes: X_POST_CACHE_BYTES,
    maxInFlight: X_POST_MAX_IN_FLIGHT,
    hitTtlMs: X_POST_TTL_MS,
    missTtlMs: X_POST_MISS_TTL_MS,
    sizeOf: (post) => (isNotNow(post) ? 0 : JSON.stringify(post).length * 2),
    keeps: (post) => !isNotNow(post),
  });

  /** The post `id` (validated: `isXPostId`). */
  static async fetchPost(id: string): Promise<TXPostRead> {
    const known = XPostApplication.posts.stale(id);
    const post = await XPostApplication.posts.read(id, async () => {
      if (Date.now() < XPostApplication.pausedUntil || !XPostApplication.budget.take()) return X_POST_BUSY;
      const tweet = await NextJsXPostService.fetch(id);
      if (tweet === X_POST_FAILED) {
        XPostApplication.pausedUntil = Date.now() + X_POST_PAUSE_MS;
        return X_POST_UNAVAILABLE;
      }
      const post = toXPost(tweet);
      // X's answer for another post than the one asked for is none.
      return post?.id === id ? post : null;
    });
    if (post !== BOUNDED_READ_BUSY && !isNotNow(post)) return post;
    // Not read now: the post kept before, expired or not, answers.
    if (known !== undefined && known !== null && !isNotNow(known)) return known;
    return post === BOUNDED_READ_BUSY ? X_POST_BUSY : post;
  }

  /**
   * Whether the post `id` carries the image `src` (as `normalizeImageSrc` spells it): one of its photos
   * or its video's still on X's media host (`TXPost.images`). Busy or unavailable while the post cannot
   * be read now.
   */
  static async carriesImage(id: string, src: string): Promise<boolean | TNotNow> {
    const post = await XPostApplication.fetchPost(id);
    if (isNotNow(post)) return post;
    return post?.images.includes(src) ?? false;
  }

  /** Empties the cache, fills the budget and ends any pause (tests). */
  static clearCache(): void {
    XPostApplication.posts.clear();
    XPostApplication.budget.reset();
    XPostApplication.pausedUntil = 0;
  }
}
