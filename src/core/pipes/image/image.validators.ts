import { PINAKES_URI_MAX_BYTES } from '@/config/pinakes';
import { isResolvableLink } from '@/pipes/resource/resource.search';

/** The longest image address the route takes: a card's image URL is far shorter. */
export const IMAGE_SRC_MAX_LENGTH = 4096;
/** The longest episode title the route searches a show's episodes for. */
export const IMAGE_EPISODE_MAX_LENGTH = 200;

/**
 * An image address as the image route compares and reads it (`URL.href`), or `null` when it is no
 * address the route ever reads: not `http(s)`, with credentials (`user:password@`), on another port
 * than the scheme's own, longer than `IMAGE_SRC_MAX_LENGTH`, or not a URL. Card values and the
 * request's `src` go through this one spelling, so `https://A.example/x.jpg` and
 * `https://a.example/x.jpg` are one image.
 */
export function normalizeImageSrc(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > IMAGE_SRC_MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port !== '') return null;
  return url.href;
}

/** The YouTube thumbnail sizes the route reads: 16:9 both (`hq720` sharp, `mqdefault` there for every video). */
export const YOUTUBE_THUMBNAIL_VARIANTS = ['hq720', 'mqdefault'] as const;

/** A YouTube video's thumbnail as the route reads it: the video's ID and a listed size. */
export type TYouTubeThumbnail = { id: string; variant: (typeof YOUTUBE_THUMBNAIL_VARIANTS)[number] };

/** A YouTube video ID: eleven letters, digits, `-` or `_`. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The one address a YouTube thumbnail is read from: on `i.ytimg.com`, made of the ID and the size only. */
export function getYouTubeThumbnailSource({ id, variant }: TYouTubeThumbnail): string {
  return `https://i.ytimg.com/vi/${id}/${variant}.jpg`;
}

/**
 * Image route input validators.
 *
 * The route takes a resource (`uri`, the link of the Pinakes card the image is on, or `link`, a link
 * whose own preview names the image) and the image (`src`, as the card or preview carries it), never
 * an address alone: what may be read is what that card or preview carries, decided after it is read.
 */
export class ImageValidators {
  private constructor() {}

  /**
   * The resource as Pinakes is asked for it, or `null`: not a string, empty, longer than
   * `PINAKES_URI_MAX_BYTES`, not a URI, or one with credentials (`isResolvableLink`).
   */
  static validateUri(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const uri = value.trim();
    if (!uri || new TextEncoder().encode(uri).length > PINAKES_URI_MAX_BYTES || !isResolvableLink(uri)) return null;
    return uri;
  }

  /** The image address (`normalizeImageSrc`), or `null` when the route never reads it. */
  static validateSrc(value: string | null | undefined): string | null {
    return normalizeImageSrc(value);
  }

  /** A YouTube thumbnail (`youtube`, `variant`), or `null` for an ID or a size the route never reads. */
  static validateYouTube(id: string | null, variant: string | null): TYouTubeThumbnail | null {
    if (!id || !YOUTUBE_ID.test(id)) return null;
    const size = YOUTUBE_THUMBNAIL_VARIANTS.find((value) => value === variant);
    return size ? { id, variant: size } : null;
  }

  /**
   * An episode's title (`episode`, optional): the words a show's episodes are searched for when the
   * image is an episode's art the show's card does not list. `undefined` when absent, `null` when
   * empty or longer than `IMAGE_EPISODE_MAX_LENGTH`.
   */
  static validateEpisode(value: string | null | undefined): string | null | undefined {
    if (value === null || value === undefined) return undefined;
    const episode = value.trim();
    return episode && episode.length <= IMAGE_EPISODE_MAX_LENGTH ? episode : null;
  }
}
