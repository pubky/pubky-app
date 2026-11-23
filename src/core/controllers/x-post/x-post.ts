import { X_POST_BUSY, X_POST_UNAVAILABLE, XPostApplication } from '@/application/x-post/x-post';
import { HttpStatusCode } from '@/libs/http/http.types';
import { isXPostId, type TXPost } from '@/pipes/x-post/x-post';

export type TXPostControllerResult =
  | { ok: true; post: TXPost }
  | {
      ok: false;
      statusCode:
        | HttpStatusCode.BAD_REQUEST
        | HttpStatusCode.NOT_FOUND
        | HttpStatusCode.BAD_GATEWAY
        | HttpStatusCode.SERVICE_UNAVAILABLE;
    };

/**
 * Controller for X posts read by the app's server (`/api/x-post`), so a viewer's browser shows an X post
 * a Pinakes card cannot tell without asking X.
 */
export class XPostController {
  private constructor() {}

  /**
   * One X post by its ID.
   *
   * @param params.id - Raw `id` (may be null): the post's ID, digits only
   * @returns The post; 400 for an ID that is not one; 404 when X has no such post; 502 when X could not
   *   be read for now; 503 past the route's budget and caps
   */
  static async fetch({ id }: { id: string | null }): Promise<TXPostControllerResult> {
    if (!isXPostId(id)) return { ok: false, statusCode: HttpStatusCode.BAD_REQUEST };
    const post = await XPostApplication.fetchPost(id);
    if (post === X_POST_BUSY) return { ok: false, statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
    if (post === X_POST_UNAVAILABLE) return { ok: false, statusCode: HttpStatusCode.BAD_GATEWAY };
    return post ? { ok: true, post } : { ok: false, statusCode: HttpStatusCode.NOT_FOUND };
  }
}
