import type { NexusPostDetails } from '@/services/nexus/nexus.types';
import { isArticleContent } from './articleContent';
import { resolveArticleCover } from './articleCover';
import { resolvePostAttachmentUrl } from './postAttachmentUrl';
import { POST_COVER_DESKTOP_VARIANT, POST_COVER_MOBILE_VARIANT } from './postCoverVariant';

/** The two cover URLs the article hero renders, one per side of the desktop breakpoint. */
export interface PostCoverPreloadUrls {
  mobile: string;
  desktop: string;
}

/**
 * CDN URLs of the image a post page renders as its cover ("hero"), or `null` when it renders
 * none. Both are resolved from the article's cover as `resolveArticleCover` finds it: the
 * envelope's `cover_image`, or slot 0 of a 0.x article under the slot-0 rule (ADR-0023).
 *
 * Mirrors the client's article rendering: `PostArticleDetail` is the surface that puts the
 * cover above the body, and it does so only for `kind: long` posts whose content
 * parses as an article (`SinglePostContent`).
 * The variants come from the same constants the hero renders from, so the preloaded URL is the
 * one the `<img>` asks for and the browser does not fetch twice.
 *
 * Server-side, so the post page can emit a `rel=preload` for the LCP image before any client
 * JavaScript runs. The cover's content type is only known after the client resolves file
 * metadata, so a non-image cover is preloaded and discarded. Pure: no IO, safe in a Server
 * Component.
 */
export function resolvePostCoverPreloadUrls(
  post: Pick<NexusPostDetails, 'kind' | 'content' | 'attachments'>,
): PostCoverPreloadUrls | null {
  if (post.kind !== 'long' || !isArticleContent(post.content)) return null;

  const { cover } = resolveArticleCover({ content: post.content, attachments: post.attachments });
  if (!cover) return null;

  const mobile = resolvePostAttachmentUrl(cover, POST_COVER_MOBILE_VARIANT);
  const desktop = resolvePostAttachmentUrl(cover, POST_COVER_DESKTOP_VARIANT);

  return mobile && desktop ? { mobile, desktop } : null;
}
