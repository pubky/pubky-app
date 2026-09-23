import type { NexusPostDetails } from '@/services/nexus/nexus.types';
import { isArticleContent, parseArticleContent } from './articleContent';
import { articleHasInlineSlotZero } from './articleInlineImages';
import { resolvePostAttachmentUrl } from './postAttachmentUrl';
import { POST_COVER_VARIANT } from './postCoverVariant';

/**
 * CDN URL of the image a post page renders as its cover ("hero"), or `null` when
 * the post has none.
 *
 * Mirrors what the client renders: the cover is a surface of
 * `PostArticleDetail`, which `SinglePostContent` picks for `kind: long` posts
 * whose content parses as an article. Slot 0 is the cover unless the body
 * references `attachment:0`, which makes it an inline image instead
 * (`articleHasInlineSlotZero`). The variant is `POST_COVER_VARIANT`, the same
 * constant the detail page renders from, so the preloaded URL is the one the
 * `<img>` asks for and the browser does not fetch twice.
 *
 * Pure, no IO, safe in a Server Component: the post page uses it to emit a
 * `rel="preload"` for the image that would otherwise only be discovered after
 * hydration, so the browser can start the download during HTML parsing.
 *
 * Caveat: the attachment's content type is only known once the client resolves
 * file metadata, so a non-image slot 0 is preloaded and discarded. Nexus post
 * details carry the URIs but no file metadata, and one wasted request is cheaper
 * than a hero that arrives seconds late.
 */
export function resolvePostCoverPreloadUrl(
  post: Pick<NexusPostDetails, 'kind' | 'content' | 'attachments'>,
): string | null {
  if (post.kind !== 'long' || !isArticleContent(post.content)) return null;

  const attachments = post.attachments;
  if (!attachments?.length) return null;

  if (articleHasInlineSlotZero(parseArticleContent(post.content)?.body ?? '')) return null;

  return resolvePostAttachmentUrl(attachments[0], POST_COVER_VARIANT);
}
