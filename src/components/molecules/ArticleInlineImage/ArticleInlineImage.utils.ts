import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { isAttachmentRefScheme, isAuthorFileUri, parseAttachmentRef } from '@/libs/post/articleInlineImages';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { ResolvedArticleImageSrc } from './ArticleInlineImage.types';

/**
 * Resolves an article inline-image destination to a loadable URL.
 *
 * Policy:
 * - `attachment:{n}` — the slot must exist and hold a homeserver file URI
 *   owned by the article author; resolved to the CDN MAIN variant. Malformed
 *   refs, out-of-range slots, and non-author targets are invalid.
 * - Direct `pubky://…/files/{id}` URIs (any owner) — resolved to the CDN.
 * - `https:` URLs — allowed as-is (rendered with no-referrer + lazy loading).
 * - Everything else (`http:`, `data:`, `blob:`, malformed) — invalid; the
 *   caller renders a placeholder and must not fire a network request.
 */
export function resolveArticleImageSrc(params: {
  src: string | null | undefined;
  attachments: string[];
  authorId: string;
}): ResolvedArticleImageSrc {
  const { src, attachments, authorId } = params;
  const trimmed = src?.trim();
  if (!trimmed) return { kind: 'invalid' };

  const index = parseAttachmentRef(trimmed);
  if (index !== null) {
    const uri = attachments[index];
    if (!uri || !isAuthorFileUri(uri, authorId)) return { kind: 'invalid' };
    const url = pubkyUriToCdnUrl(uri, FileVariant.MAIN);
    return url ? { kind: 'attachment', url, index } : { kind: 'invalid' };
  }
  // Malformed attachment-scheme refs (attachment:01, ATTACHMENT:2, …)
  if (isAttachmentRefScheme(trimmed)) return { kind: 'invalid' };

  if (trimmed.startsWith('pubky://')) {
    const url = pubkyUriToCdnUrl(trimmed, FileVariant.MAIN);
    return url ? { kind: 'pubky', url } : { kind: 'invalid' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return { kind: 'external', url: parsed.toString() };
  } catch {
    // fall through to invalid
  }

  return { kind: 'invalid' };
}
