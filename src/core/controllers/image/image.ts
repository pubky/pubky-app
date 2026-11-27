import { ImageApplication } from '@/application/image/image';
import { IMAGE_BUSY, IMAGE_UNAVAILABLE, type TResourceImage } from '@/application/image/image.types';
import { X_POST_BUSY, X_POST_UNAVAILABLE, XPostApplication } from '@/application/x-post/x-post';
import { HttpStatusCode } from '@/libs/http/http.types';
import { ImageValidators } from '@/pipes/image/image.validators';
import { OgMetadataValidators } from '@/pipes/og-metadata/og-metadata.validators';
import { isXPostId } from '@/pipes/x-post/x-post';

export type TImageControllerResult =
  | { ok: true; image: TResourceImage }
  | {
      ok: false;
      statusCode:
        | HttpStatusCode.BAD_REQUEST
        | HttpStatusCode.NOT_FOUND
        | HttpStatusCode.BAD_GATEWAY
        | HttpStatusCode.SERVICE_UNAVAILABLE;
    };

/**
 * Controller for Pinakes card images, link preview images and YouTube thumbnails served from the app's
 * origin (`/api/image`), so a viewer's browser never asks an image host.
 */
export class ImageController {
  private constructor() {}

  /**
   * One image: of one card (`uri`, with `og` its own preview's), of one link's own preview with no card
   * (`link`), of one X post the app's server read (`xpost`: one of its photos or its video's still,
   * `XPostApplication.carriesImage`), or a YouTube video's thumbnail (`youtube` + `variant`); exactly one
   * of `uri`, `link`, `xpost`, `youtube`.
   *
   * @param params.uri - Raw `uri` (may be null): the link of the Pinakes card the image is on
   * @param params.link - Raw `link` (may be null): a link with no card whose preview (`og:image`) names the image
   * @param params.src - Raw `src` (may be null): the image, as the card or preview carries it
   * @param params.episode - Raw `episode` (may be null): an episode's title, for a show's episode art
   * @param params.og - Raw `og` (`1` or null): the card's own preview image, for a card with none of its own
   * @param params.xpost - Raw `xpost` (may be null): an X post's ID, digits only
   * @param params.youtube - Raw `youtube` (may be null): a YouTube video's ID
   * @param params.variant - Raw `variant` (may be null): the thumbnail's size
   * @returns The image; 400 for input the route never reads; 404 when the card or link is unknown or
   *   does not carry the image, or the image cannot be served; 502 when Pinakes, the page or the image
   *   host failed for now; 503 past the route's budgets and caps
   */
  static async fetch(params: {
    uri: string | null;
    link?: string | null;
    src: string | null;
    episode?: string | null;
    og?: string | null;
    xpost?: string | null;
    youtube?: string | null;
    variant?: string | null;
  }): Promise<TImageControllerResult> {
    const modes = [params.uri, params.link, params.xpost, params.youtube].filter((value) => value != null);
    if (modes.length !== 1) return refused();
    let image;
    if (params.youtube != null) {
      const thumbnail = ImageValidators.validateYouTube(params.youtube, params.variant ?? null);
      if (!thumbnail || params.src != null) return refused();
      image = await ImageApplication.fetchYouTubeThumbnail(thumbnail);
    } else {
      const src = ImageValidators.validateSrc(params.src);
      if (!src) return refused();
      if (params.uri != null) {
        const uri = ImageValidators.validateUri(params.uri);
        const episode = ImageValidators.validateEpisode(params.episode);
        if (!uri || episode === null || (params.og != null && params.og !== '1')) return refused();
        image = await ImageApplication.fetchCardImage(uri, src, { episode, og: params.og === '1' });
      } else if (params.xpost != null) {
        if (!isXPostId(params.xpost)) return refused();
        // Only an image the post itself carries, read by the app's server, never an address alone.
        const carried = await XPostApplication.carriesImage(params.xpost, src);
        if (carried === X_POST_BUSY) return { ok: false, statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
        if (carried === X_POST_UNAVAILABLE) return { ok: false, statusCode: HttpStatusCode.BAD_GATEWAY };
        image = carried ? await ImageApplication.fetchPostImage(src) : null;
      } else {
        const link = await OgMetadataValidators.validateSafe(params.link ?? null);
        if (!link.ok) return refused();
        image = await ImageApplication.fetchLinkImage(link.url, src);
      }
    }
    if (image === IMAGE_BUSY) return { ok: false, statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
    if (image === IMAGE_UNAVAILABLE) return { ok: false, statusCode: HttpStatusCode.BAD_GATEWAY };
    return image ? { ok: true, image } : { ok: false, statusCode: HttpStatusCode.NOT_FOUND };
  }
}

function refused(): TImageControllerResult {
  return { ok: false, statusCode: HttpStatusCode.BAD_REQUEST };
}
