import type { Tweet } from 'react-tweet/api';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * An X post as the app's server reads it (`/api/x-post`) and the app shows it: who wrote it, what and
 * when, and its media, nothing more. Pure transforms only: the read itself is `NextJsXPostService`'s.
 */

/** An X post as the app shows it: the fields a post's header and text need, and its media's addresses. */
export interface TXPost {
  /** The post's ID (`isXPostId`). */
  id: string;
  text: string;
  authorName: string | null;
  /** The author's handle, without `@`. */
  handle: string | null;
  /** When it was posted (ISO 8601), or `null`. */
  published: string | null;
  /** The image the post shows first: its video's still, else its first photo; `null` without media. */
  image: string | null;
  /** Every image of the post the image route may serve for it (`?xpost=`): its video's still and its photos. */
  images: string[];
  /** The post carries a video (or a GIF): its still shows, the video plays from a press. */
  hasVideo: boolean;
  /**
   * The video's MP4 file on X's video host (`video.twimg.com`), which the app's own player plays inside
   * the post from a press; `null` without one (a live broadcast, no MP4 variant): X's own post shows it.
   */
  video: string | null;
  /** The video's width to height (`16 / 9`), as X names it, else `null`: the player's box is sized to it. */
  videoAspect: number | null;
}

/** Where X serves a post's video files, the only host whose MP4 the app's player is given. */
const X_VIDEO_HOST = 'video.twimg.com';
/** The highest bit rate picked for the app's player (720p): a larger file costs the viewer for little. */
const X_VIDEO_MAX_BITRATE = 2_500_000;

/** The largest ID X gives a post: a signed 64-bit number. */
const X_POST_ID_MAX = BigInt('9223372036854775807');

/** An X post's ID as X writes it: digits, no leading zero, at most a signed 64-bit number. */
export function isXPostId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= X_POST_ID_MAX;
}

/** Hosts an X post's link is on. */
const X_HOSTS = new Set(['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com', 'mobile.x.com', 'mobile.twitter.com']);

/** Where X serves a post's media, the only host the app's server reads a post's image from. */
const X_MEDIA_HOST = 'pbs.twimg.com';

/** The most images one post is read for (X allows four photos, plus a still). */
const X_POST_MAX_IMAGES = 5;
/** The longest text kept of a post (a long post's text is cut by X's own read). */
const X_POST_MAX_TEXT = 4_000;

/**
 * The ID of an X post's link (`https://x.com/<user>/status/<id>`, also `twitter.com`, `www.` and
 * `mobile.`), or `null` for any other link.
 */
export function getXPostId(link: string | null | undefined): string | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !X_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }
  const [, , status, id] = url.pathname.split('/');
  return status === 'status' && isXPostId(id) ? id : null;
}

/** An image address of X's media host (`https://pbs.twimg.com/...`), else `null`. */
function getMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === X_MEDIA_HOST && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** An MP4 address on X's video host (`https://video.twimg.com/...`), else `null`. */
function getVideoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === X_VIDEO_HOST && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * The MP4 of a post's video the app plays: the highest bit rate up to `X_VIDEO_MAX_BITRATE`, else the
 * lowest; never a stream playlist (`application/x-mpegURL`) or another host.
 */
function getVideoFile(tweet: Pick<Tweet, 'mediaDetails' | 'video'>): string | null {
  const variants = [
    ...(tweet.mediaDetails ?? []).flatMap((media) =>
      media.type === 'video' || media.type === 'animated_gif'
        ? media.video_info.variants.map((variant) => ({
            type: variant.content_type,
            url: variant.url,
            bitrate: variant.bitrate ?? 0,
          }))
        : [],
    ),
    ...(tweet.video?.variants ?? []).map((variant) => ({ type: variant.type, url: variant.src, bitrate: 0 })),
  ]
    .filter((variant) => variant.type === 'video/mp4')
    .map((variant) => ({ ...variant, url: getVideoUrl(variant.url) }))
    .filter((variant): variant is { type: string; url: string; bitrate: number } => variant.url !== null);
  if (variants.length === 0) return null;
  const fitting = variants.filter((variant) => variant.bitrate <= X_VIDEO_MAX_BITRATE);
  const pick = fitting.length
    ? fitting.reduce((best, variant) => (variant.bitrate > best.bitrate ? variant : best))
    : variants.reduce((best, variant) => (variant.bitrate < best.bitrate ? variant : best));
  return pick.url;
}

/** A video's width to height from X's answer (`[16, 9]`), bounded to what a box can show, else `null`. */
function getVideoAspect(tweet: Pick<Tweet, 'mediaDetails' | 'video'>): number | null {
  const detail = (tweet.mediaDetails ?? []).find((media) => media.type === 'video' || media.type === 'animated_gif');
  const [width, height] = (detail && 'video_info' in detail ? detail.video_info.aspect_ratio : null) ??
    tweet.video?.aspectRatio ?? [0, 0];
  const aspect = Number(width) / Number(height);
  return Number.isFinite(aspect) && aspect >= 0.25 && aspect <= 4 ? aspect : null;
}

/** The three entities X escapes in a post's text. */
function unescapeText(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * A post's text as X shows it: the part in its display range (no trailing media link), its short
 * links written out as their full address.
 */
function getPostText(tweet: Pick<Tweet, 'text' | 'display_text_range' | 'entities'>): string {
  const characters = Array.from(tweet.text ?? '');
  const [start, end] = Array.isArray(tweet.display_text_range) ? tweet.display_text_range : [0, characters.length];
  let text = characters.slice(Math.max(0, start), Math.min(characters.length, end)).join('');
  for (const link of tweet.entities?.urls ?? []) {
    if (link.url && link.expanded_url) text = text.split(link.url).join(link.expanded_url);
  }
  return unescapeText(text).trim().slice(0, X_POST_MAX_TEXT);
}

/**
 * The post the app shows from X's answer for one post (`react-tweet`'s `Tweet`): its text, author,
 * date, and its media on X's media host only. `null` for an answer that is no post or has no text and
 * no media.
 */
export function toXPost(tweet: Tweet | null | undefined): TXPost | null {
  if (!tweet || !isXPostId(tweet.id_str)) return null;
  const text = typeof tweet.text === 'string' ? getPostText(tweet) : '';
  const photos = (tweet.photos ?? []).map((photo) => getMediaUrl(photo.url));
  const details = tweet.mediaDetails ?? [];
  const videoDetail = details.find((media) => media.type === 'video' || media.type === 'animated_gif');
  const poster = getMediaUrl(tweet.video?.poster) ?? getMediaUrl(videoDetail?.media_url_https);
  const images = [...new Set([poster, ...photos].filter((url): url is string => url !== null))].slice(
    0,
    X_POST_MAX_IMAGES,
  );
  if (!text && images.length === 0) return null;
  const handle = tweet.user?.screen_name?.trim().replace(/^@/, '') || null;
  const published = typeof tweet.created_at === 'string' && tweet.created_at ? tweet.created_at : null;
  return {
    id: tweet.id_str,
    text,
    authorName: tweet.user?.name?.trim() || handle,
    handle,
    published,
    image: images[0] ?? null,
    images,
    hasVideo: Boolean(tweet.video) || videoDetail !== undefined,
    video: getVideoFile(tweet),
    videoAspect: getVideoAspect(tweet),
  };
}

/**
 * The MP4 of a post card's video that the app's own player plays (`withXPost`'s `stream`, on X's video
 * host only), else `null`.
 */
export function getXPostVideo(card: Pick<TPinakesResourceDetail, 'stream'> | null | undefined): string | null {
  return card?.stream?.type === 'video/mp4' ? getVideoUrl(card.stream.url) : null;
}

/**
 * The card a post shows when Pinakes' own does not tell it (none, or one without its text: pending,
 * unread, a failed read): a settled social post card for the link (`ResourceCard` shows it as a post),
 * from the post the app's server read (`TXPost`), keeping what Pinakes' card has (its ID, links,
 * group, Also on). The image is the post's (its video's still, else its first photo); a video tells
 * `hasPostVideo` so: its MP4 as the card's `stream`, which the app's player plays inside the post from a
 * press (`XPostVideo`), else a `video` embed kind, whose press shows X's own post.
 */
/** The embed a post card says it has a video with, when Pinakes' card names none. */
const EMPTY_EMBED = {
  provider: 'x',
  kind: 'video',
  src: '',
  height: null,
  aspect: null,
  allow: [],
  autoplay_param: null,
};

export function withXPost(card: TPinakesResourceDetail | null, link: string, post: TXPost): TPinakesResourceDetail {
  const base: TPinakesResourceDetail = card ?? {
    id: '',
    uri: link,
    status: 'ok',
    type_path: [],
    also_on: [],
    open_in: [],
    refs: [],
    collections: 0,
    aliases: [],
    keys: [],
  };
  return {
    ...base,
    status: 'ok',
    type: 'SocialMediaPosting',
    type_path: ['Thing', 'CreativeWork', 'SocialMediaPosting'],
    name: post.text || null,
    description: null,
    image: post.image,
    // A video tells `hasPostVideo` so, also when the post's first image is a photo: the app's own player
    // plays its MP4 (`stream`), else X's post shows it (a `video` embed kind).
    ...(post.video
      ? { stream: { url: post.video, type: 'video/mp4', preview: false } }
      : post.hasVideo
        ? { stream: null, embed: { ...(base.embed ?? EMPTY_EMBED), kind: 'video' } }
        : {}),
    site: base.site ?? 'x.com',
    facts: {
      ...base.facts,
      ...(post.handle ? { author: post.handle } : {}),
      ...(post.authorName ? { author_name: post.authorName } : {}),
      ...(post.published ? { published: post.published } : {}),
    },
  };
}
