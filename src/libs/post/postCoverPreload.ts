import type { NexusPostDetails } from '@/services/nexus/nexus.types';
import { isArticleContent, parseArticleContent } from './articleContent';
import { articleHasInlineSlotZero } from './articleInlineImages';
import { resolvePostAttachmentUrl } from './postAttachmentUrl';
import { POST_COVER_DESKTOP_VARIANT, POST_COVER_MOBILE_VARIANT } from './postCoverVariant';

/** The two cover URLs the article hero renders, one per side of the desktop breakpoint. */
export interface PostCoverPreloadUrls {
  mobile: string;
  desktop: string;
}

/**
 * CDN URLs of the image a post page renders as its cover ("hero"), or `null` when it renders
 * none. Both are resolved from slot 0 of the post's attachments.
 *
 * Mirrors the client's article rendering: `PostArticleDetail` is the surface that puts the
 * first attachment above the body, and it does so only for `kind: long` posts whose content
 * parses as an article (`SinglePostContent`). The slot-0 rule (`articleHasInlineSlotZero`)
 * makes slot 0 an inline image instead of a cover when the body references `attachment:0`.
 * The variants come from the same constants the hero renders from, so the preloaded URL is the
 * one the `<img>` asks for and the browser does not fetch twice.
 *
 * Server-side, so the post page can emit a `rel=preload` for the LCP image before any client
 * JavaScript runs. The attachment's content type is only known after the client resolves file
 * metadata, so a non-image slot 0 is preloaded and discarded. Pure: no IO, safe in a Server
 * Component.
 */
export function resolvePostCoverPreloadUrls(
  post: Pick<NexusPostDetails, 'kind' | 'content' | 'attachments'>,
): PostCoverPreloadUrls | null {
  if (post.kind !== 'long' || !isArticleContent(post.content)) return null;

  const attachments = post.attachments;
  if (!attachments?.length) return null;

  if (articleHasInlineSlotZero(parseArticleContent(post.content)?.body ?? '')) return null;

  const mobile = resolvePostAttachmentUrl(attachments[0], POST_COVER_MOBILE_VARIANT);
  const desktop = resolvePostAttachmentUrl(attachments[0], POST_COVER_DESKTOP_VARIANT);

  return mobile && desktop ? { mobile, desktop } : null;
}
