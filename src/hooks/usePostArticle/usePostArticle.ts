'use client';

import { useEffect } from 'react';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { parseArticleContent } from '@/libs/post/articleContent';
import { isArticleCoverContentType, resolveArticleCover, settleArticleSlotZero } from '@/libs/post/articleCover';
import { getAttachmentAtSlot } from '@/libs/utils/unlockedMedia';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { toast } from '@/molecules/Toaster/toast';
import type { AttachmentConstructed, PendingAttachment } from '@/organisms/PostAttachments/PostAttachments.types';
import type { FileVariant } from '@/services/nexus/file/file.types';

export interface CoverImage {
  src: string;
  /** Set when a desktop variant was requested: the same file at its larger size. */
  desktopSrc?: string;
  /**
   * Set alongside `desktopSrc`: the size to use when `desktopSrc` fails to load. The article
   * hero swaps the desktop `<source>` to it on the cover's `error` event, so a desktop variant
   * Nexus cannot serve yet (`large` before its deploy) degrades to a usable image.
   */
  desktopFallbackSrc?: string;
  alt: string;
  width?: number;
  height?: number;
}

interface UsePostArticleParams {
  content: string;
  attachments: PostDetailsModel['attachments'];
  coverImageVariant: FileVariant;
  /**
   * Files the caller holds, by slot: this session's uploads, index-aligned with `attachments`, or
   * unlocked (Locks) content, which has no Nexus attachments at all and records each file's `slot`.
   * Slot 0 is the cover only under the slot-0 rule (`resolveArticleCover`'s `legacyCoverSlot`):
   * unlocked content and a 0.x article. An article this app writes keeps its cover in the envelope,
   * so its slot 0 is a body image.
   */
  localAttachments?: AttachmentConstructed[];
  /** Unlocked attachments whose bytes are still downloading. */
  pendingAttachments?: PendingAttachment[];
  /**
   * The cover this session published or edited: its own entry, since an envelope cover is no
   * attachment slot (ADR-0023 as amended by ADR-0027). It stands in for the remote cover.
   */
  localCover?: AttachmentConstructed;
  /**
   * Second, larger source for surfaces that render the cover at full width (the article hero).
   * Left unset by feed-sized surfaces, which never want the larger file.
   */
  coverImageDesktopVariant?: FileVariant;
  /**
   * Size to swap to when {@link coverImageDesktopVariant} fails to load. Left unset by surfaces
   * that render a variant they know Nexus serves.
   */
  coverImageDesktopFallbackVariant?: FileVariant;
}

interface UsePostArticleResult {
  title: string;
  body: string;
  /**
   * The cover to draw: the caller's local cover if it holds one, else the Nexus file. Null when the
   * article has none (no envelope cover, and slot 0 is inline media or not an image), or while a 0.x
   * slot 0 is still unknown.
   */
  coverImage: CoverImage | null;
  /** The cover is an image whose local bytes are still downloading. */
  isCoverPending: boolean;
  /** The Nexus cover's file row is still loading and no local cover stands in for it. */
  isCoverLoading: boolean;
}

/**
 * Custom hook to extract article data from post content and attachments
 *
 * An envelope cover's URL is a pure function of the cover URI and the variant, so it
 * exists on the first render that has post details: no file-metadata round trip
 * stands in front of the hero. The metadata row is a progressive refinement (alt
 * text, intrinsic size) and stays authoritative once the lookup settles: a row
 * that is not an image, or a lookup that settles with no row, drops the cover,
 * as it did when the cover waited for the row. A 0.x article's slot 0 (rule B) is
 * different: only its row can say it is an image, so nothing paints until the row
 * does, and a PDF or a video there never flashes as a cover. A row persisted after
 * the post row still renders, because the lookup is live.
 *
 * This is the one place that picks the cover, for Nexus and local files alike (#2660):
 * callers draw `coverImage` and check nothing again.
 *
 * @param params.content - The article envelope: title, body and, for a v1 article, its cover
 * @param params.attachments - The file attachment URIs for the post
 * @param params.coverImageVariant - The variant to use when generating the cover image URL
 * @returns Object containing title, body, and coverImage
 *
 * @example
 * ```tsx
 * const { title, body, coverImage } = usePostArticle({
 *   content: '{"title":"My Article","body":"Article content..."}',
 *   attachments: ['pubky://user/pub/social/v1/files/0ABC…/image.png'],
 *   coverImageVariant: FileVariant.FEED,
 * });
 * ```
 */
export function usePostArticle({
  content,
  attachments,
  coverImageVariant,
  localAttachments,
  pendingAttachments,
  localCover,
  coverImageDesktopVariant,
  coverImageDesktopFallbackVariant,
}: UsePostArticleParams): UsePostArticleResult {
  // Parsed on render, so a surface that mounts with this content never paints an empty title first
  const parsed = parseArticleContent(content);
  const title = parsed?.title ?? '';
  const body = parsed?.body ?? '';

  const isParseFailed = parsed === null;
  useEffect(() => {
    if (isParseFailed) {
      toast({
        variant: 'error',
        description: 'Could not parse article content',
      });
    }
  }, [content, isParseFailed]);

  const localSlotZero = getAttachmentAtSlot(localAttachments, 0);
  const pendingSlotZero = getAttachmentAtSlot(pendingAttachments, 0);
  // What a local slot-0 entry says about `attachments[0]`. Unlocked content has no Nexus attachments,
  // so its local files are the slots, the pending list while the bytes download. A same-session list
  // counts only while it matches the attachment list: right after an edit it already holds the new
  // order while this render still shows the old post, and a non-image in the new slot 0 must not
  // veto the cover the old post still has.
  const slotZeroEntry = !attachments?.length
    ? (localSlotZero ?? pendingSlotZero)
    : localAttachments?.length === attachments.length
      ? localSlotZero
      : undefined;

  // Where the cover is, computed synchronously from the envelope and the published body so the
  // cover never flashes for articles whose slot 0 is an inline image (ADR-0023 as amended by
  // ADR-0027). A local slot-0 entry already knows its type, which rule B needs from the slot's
  // metadata; the other shapes ignore it.
  const located = resolveArticleCover({ content, attachments, slotZeroContentType: slotZeroEntry?.type });

  // Only the cover is relevant; inline attachments render inside the article body and are never
  // resolved here. An edit that replaces or removes the cover derives a new result, so no stale
  // cover can linger. A 0.x article's slot 0 is read too: its row is what says it is an image, and
  // so the cover (rule B).
  const coverFileUri = located.cover ?? located.coverCandidate ?? undefined;
  const { files, isLoading: isCoverLoading } = useAttachmentsMetadata({
    fileUris: coverFileUri ? [coverFileUri] : [],
    onError: () => toast({ variant: 'error', description: 'Could not load cover image' }),
  });
  // The row for *this* uri, not merely the first of a retained previous snapshot: when the
  // attachment is replaced, the old row must not carry its alt text onto the new cover.
  const coverFile = files.find((file) => file.uri === coverFileUri);
  // Rule B settles on the row: an image makes slot 0 the cover; anything else, or no row once the
  // read settled, leaves the article without one.
  const resolved =
    located.coverCandidate && (coverFile || !isCoverLoading)
      ? settleArticleSlotZero(located, Boolean(coverFile && isArticleCoverContentType(coverFile.content_type)))
      : located;
  const hasCover =
    resolved.cover !== null ||
    resolved.coverCandidate !== null ||
    (resolved.legacyCoverSlot && Boolean(localSlotZero || pendingSlotZero));
  const coverUri = resolved.cover ?? undefined;

  // `pubkyUriToCdnUrl` ends in the same `filesApi.getFileUrl` the server preload
  // (`resolvePostCoverPreloadUrls`) resolves through, and both read the shared cover variants, so
  // the URL rendered here is the one the document already preloaded. It returns `null` for
  // anything that is not a homeserver file URI, which the CDN cannot serve.
  const coverSrc = pubkyUriToCdnUrl(coverUri, coverImageVariant);
  const coverDesktopSrc = coverImageDesktopVariant ? pubkyUriToCdnUrl(coverUri, coverImageDesktopVariant) : null;
  // The desktop fallback (`main`, the untouched upload) waits for the row to confirm an image: a
  // provisional slot 0 that turns out to be a video would otherwise pull its multi-megabyte original
  // through the `<img>` when `large` fails. A failure recorded before the row lands still swaps as
  // soon as it does.
  const coverDesktopFallbackSrc =
    coverFile && coverImageDesktopFallbackVariant ? pubkyUriToCdnUrl(coverUri, coverImageDesktopFallbackVariant) : null;

  // The local entry that is the cover: the session's own cover entry, else slot 0 where the slot-0
  // rule leaves it to a cover (unlocked content, a 0.x article), never when the envelope has a
  // cover or the body references `attachment:0`.
  const localCoverEntry = hasCover ? (localCover ?? (resolved.legacyCoverSlot ? localSlotZero : undefined)) : undefined;
  // An envelope cover paints before its row lands and is provisional until then: a local entry
  // already knows its type; otherwise only the row can say it is not an image, or that Nexus no
  // longer serves it (the lookup settles with no row). A 0.x slot 0 never gets here before its row
  // says image (`resolved.cover` is null until then).
  const localType = localCover?.type || (resolved.legacyCoverSlot ? slotZeroEntry?.type : undefined);
  const coverType = localType || coverFile?.content_type;
  const isCoverUnavailable = coverType ? !coverType.startsWith('image') : !isCoverLoading;

  const width = Number(coverFile?.metadata?.width);
  const height = Number(coverFile?.metadata?.height);
  const remoteCoverImage: CoverImage | null =
    coverSrc && !isCoverUnavailable
      ? {
          src: coverSrc,
          desktopSrc: coverDesktopSrc ?? undefined,
          desktopFallbackSrc: coverDesktopFallbackSrc ?? undefined,
          alt: coverFile?.name ?? '',
          ...(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : {}),
        }
      : null;

  const localCoverFile = localCoverEntry?.type.startsWith('image') ? localCoverEntry : null;
  // A `blob:` entry is a file this session uploaded or unlocked: served from memory, with no variant
  // Nexus derives from it, so it owns the desktop slot and has nothing to degrade to.
  //
  // A CDN entry is an attachment that was kept. It is seeded with its derived `large` URL, the one
  // the server preloaded, so the desktop slot renders that and a failed `large` degrades to the
  // entry's own `main`. An entry seeded without `large` resolves to the same file the remote cover
  // does, so it waits for that: holding the slot (no `srcset`, so a wide screen falls back to
  // `feed`) keeps the original upload off the wire until the preloaded variant is known. A cover
  // that never resolves still falls back to the local `main`, the only thing left to render.
  const localCoverOwnsDesktop = Boolean(localCoverFile?.urls.main.startsWith('blob:'));
  const localCoverDesktopSrc = (() => {
    if (!localCoverFile || !coverImageDesktopVariant) return undefined;
    if (localCoverOwnsDesktop) return localCoverFile.urls.main;
    if (localCoverFile.urls.large) return localCoverFile.urls.large;
    if (isCoverLoading) return undefined;
    return remoteCoverImage?.desktopSrc ?? localCoverFile.urls.main;
  })();
  const localCoverImage: CoverImage | null = localCoverFile
    ? {
        src: localCoverFile.urls.feed ?? localCoverFile.urls.main,
        desktopSrc: localCoverDesktopSrc,
        desktopFallbackSrc: coverImageDesktopVariant && !localCoverOwnsDesktop ? localCoverFile.urls.main : undefined,
        alt: localCoverFile.name,
        width: localCoverFile.width,
        height: localCoverFile.height,
      }
    : null;

  const coverImage = localCoverImage ?? remoteCoverImage;

  return {
    title,
    body,
    coverImage,
    // Only a slot-0 cover downloads; a video there never becomes a cover, so nothing holds a box for it.
    isCoverPending:
      hasCover && !coverImage && resolved.legacyCoverSlot && Boolean(pendingSlotZero?.type.startsWith('image')),
    isCoverLoading: isCoverLoading && !localCoverImage,
  };
}
