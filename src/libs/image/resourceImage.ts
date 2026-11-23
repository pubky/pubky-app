/**
 * Where a Pinakes card's images, and a link preview's, come from. The app never asks an image's host
 * from the viewer's browser: it asks its own server (`/api/image`), which reads the card from
 * Pinakes, or the link's preview, and serves the image only when that card or preview carries it.
 * Post media from homeservers and the viewer's own files are not card images and keep their own
 * addresses.
 */

/** The app's own route that serves a card's or a link preview's image. */
export const RESOURCE_IMAGE_ROUTE = '/api/image';

/**
 * The app's own address for one image of a card (`/api/image?uri=<card link>&src=<image>`), or `null`
 * without an image. `uri` is the link of the card that carries the image (its own, a latest
 * episode's, or a group member's it borrows), `src` the image as the card carries it. `episode`, an
 * episode's title, lets the route find the art of an episode older than those the show's card lists.
 */
export function getResourceImageUrl(
  uri: string,
  src: string | null | undefined,
  { episode }: { episode?: string | null } = {},
): string | null {
  if (!src) return null;
  return `${RESOURCE_IMAGE_ROUTE}?${new URLSearchParams({ uri, src, ...(episode?.trim() ? { episode: episode.trim() } : {}) })}`;
}

/**
 * The app's own address for the preview image of a card with no image of its own
 * (`/api/image?uri=<card link>&og=1&src=<its link's og:image>`), or `null` without an image: the route
 * reads the card, then its own web link's preview.
 */
export function getCardPreviewImageUrl(uri: string, src: string | null | undefined): string | null {
  if (!src) return null;
  return `${RESOURCE_IMAGE_ROUTE}?${new URLSearchParams({ uri, og: '1', src })}`;
}

/**
 * The app's own address for a link preview's image when the link has no card
 * (`/api/image?link=<link>&src=<its og:image>`), or `null`.
 */
export function getLinkImageUrl(link: string, src: string | null | undefined): string | null {
  if (!src) return null;
  return `${RESOURCE_IMAGE_ROUTE}?${new URLSearchParams({ link, src })}`;
}

/**
 * The app's own address for an image of an X post its server read (`/api/image?xpost=<post ID>&src=<image>`),
 * or `null` without an image: the route serves only a photo or video still that post carries.
 */
export function getXPostImageUrl(postId: string, src: string | null | undefined): string | null {
  if (!src) return null;
  return `${RESOURCE_IMAGE_ROUTE}?${new URLSearchParams({ xpost: postId, src })}`;
}

/** Where YouTube serves a video's thumbnails (`https://i.ytimg.com/vi/<id>/<size>.jpg`). */
const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com']);

/** A YouTube video ID: eleven letters, digits, `-` or `_`. */
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The file names of a video's default thumbnail in its sizes (not its other frames or a Short's upright one). */
const YOUTUBE_THUMBNAIL_FILE = /^(?:(?:hq|mq|sd|maxres)?default\.(?:jpg|webp)|hq720\.(?:jpg|webp)|0\.jpg)$/;

/**
 * The video ID of a YouTube thumbnail's address (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`, also `vi_webp/` and
 * `img.youtube.com`, a default thumbnail in any size), else `null`. A card names `hqdefault`, which adds bars above
 * and below the video's 16:9 frame; with the ID it shows a 16:9 size from the route instead (`getYouTubeThumbnailUrl`).
 */
export function getYouTubeThumbnailVideoId(src: string | null | undefined): string | null {
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !YOUTUBE_THUMBNAIL_HOSTS.has(url.hostname)) {
    return null;
  }
  const [, folder, id, file, ...rest] = url.pathname.split('/');
  const isThumbnail =
    (folder === 'vi' || folder === 'vi_webp') && rest.length === 0 && YOUTUBE_THUMBNAIL_FILE.test(file ?? '');
  return isThumbnail && YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

/** The app's own address for a YouTube video's thumbnail (`/api/image?youtube=<id>&variant=<size>`). */
export function getYouTubeThumbnailUrl(videoId: string, variant: 'hq720' | 'mqdefault'): string {
  return `${RESOURCE_IMAGE_ROUTE}?${new URLSearchParams({ youtube: videoId, variant })}`;
}

/** Whether `value` is an address of the app's image route, the only image a card shows. */
export function isResourceImageUrl(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith(`${RESOURCE_IMAGE_ROUTE}?`));
}

/**
 * The same route address asked once more: a route answer that failed (busy, or its host failed for
 * now) may pass on a second try, which a browser would not make for the same address.
 */
export function getImageRetryUrl(url: string): string {
  return `${url}&retry=1`;
}
