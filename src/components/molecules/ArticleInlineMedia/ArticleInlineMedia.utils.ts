import { getInlineMediaKindFromMime, inferMediaKindFromUrl } from '@/libs/file/inlineMediaKind';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { isAttachmentRefScheme, isAuthorFileUri, parseAttachmentRef } from '@/libs/post/articleInlineMedia';
import { getAttachmentAtSlot } from '@/libs/utils/unlockedMedia';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { ArticleInlineMediaProps, ResolvedArticleMedia } from './ArticleInlineMedia.types';

const IMAGE: ResolvedArticleMedia = { kind: 'image' };
const UNSUPPORTED: ResolvedArticleMedia = { kind: 'unsupported' };

function fromEntry(type: string, url: string, name: string | undefined): ResolvedArticleMedia {
  const kind = getInlineMediaKindFromMime(type);
  if (kind === 'image') return IMAGE;
  // A type the reader has no player for (another client's attachment) gets its placeholder without
  // a request: the image path would pull the whole original through `<img>` before failing. An
  // empty type says nothing and keeps the image behaviour.
  if (!kind) return type.trim() ? UNSUPPORTED : IMAGE;
  return { kind, url, name, external: false };
}

/**
 * Decides what renders an article's `![alt](src)`: `ArticleInlineImage` (which keeps the whole
 * image policy, placeholders included), a skeleton while a slot's type is unknown, or a player /
 * file card for a known non-image kind.
 *
 * - `attachment:{n}` on the CDN: the same-session local entry's type wins (the store is only used
 *   when it is index-aligned with `attachments`), then the `file_details` row matched by uri, then
 *   a skeleton until the metadata read settles. A slot that settled with no row, an out-of-range
 *   or non-author slot, and every malformed ref go to `ArticleInlineImage`, as today; a row of a
 *   type nothing here renders is a placeholder that requests nothing.
 * - `attachment:{n}` of unlocked content: typed from the bytes the reader holds.
 * - A direct `pubky://` URI stays an image: its metadata is never requested (documented limit).
 * - An `https:` URL is typed by its file extension; anything unknown stays an image.
 */
export function resolveArticleMedia(
  params: ArticleInlineMediaProps & { localStoreAttachments?: AttachmentConstructed[] },
): ResolvedArticleMedia {
  const trimmed = params.src?.trim();
  if (!trimmed) return IMAGE;

  const index = parseAttachmentRef(trimmed);

  if ('localAttachments' in params) {
    if (index === null) return resolveDirect(trimmed);
    const entry = getAttachmentAtSlot(params.localAttachments, index);
    return entry ? fromEntry(entry.type, entry.urls.main, entry.name) : IMAGE;
  }

  if (index !== null) {
    const uri = params.attachments[index];
    if (!uri || !isAuthorFileUri(uri, params.authorId)) return IMAGE;

    const aligned =
      params.localStoreAttachments?.length === params.attachments.length ? params.localStoreAttachments : undefined;
    const localEntry = aligned?.[index];
    if (localEntry) return fromEntry(localEntry.type, localEntry.urls.main, localEntry.name);

    const file = params.files.find((candidate) => candidate.uri === uri);
    if (file) {
      const url = pubkyUriToCdnUrl(uri, FileVariant.MAIN);
      return url ? fromEntry(file.content_type, url, file.name) : IMAGE;
    }

    return params.metadataSettled ? IMAGE : { kind: 'loading' };
  }

  if (isAttachmentRefScheme(trimmed)) return IMAGE;
  return resolveDirect(trimmed);
}

function resolveDirect(src: string): ResolvedArticleMedia {
  if (src.startsWith('pubky://')) return IMAGE;
  const kind = inferMediaKindFromUrl(src);
  if (!kind) return IMAGE;
  return { kind, url: new URL(src).toString(), name: undefined, external: true };
}
