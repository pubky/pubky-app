'use client';

import { useEffect } from 'react';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { parseArticleContent } from '@/libs/post/articleContent';
import { articleHasInlineSlotZero } from '@/libs/post/articleInlineMedia';
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
   * Files the caller holds: this session's uploads, index-aligned with `attachments`, or unlocked
   * content, which has no Nexus attachments at all and records each file's `slot`.
   */
  localAttachments?: AttachmentConstructed[];
  /** Unlocked attachments whose bytes are still downloading. */
  pendingAttachments?: PendingAttachment[];
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
   * The cover to draw: the caller's local slot-0 image if it holds one, else the Nexus file. Null when
   * slot 0 is inline media (the body references `attachment:0`), is not an image, or is still unknown.
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
 * The cover URL is a pure function of the attachment URI and the variant, so it
 * exists on the first render that has post details: no file-metadata round trip
 * stands in front of the hero. The metadata row is a progressive refinement (alt
 * text, intrinsic size) and stays authoritative once the lookup settles: a row
 * that is not an image, or a lookup that settles with no row, drops the cover,
 * as it did when the cover waited for the row. A row persisted after the post
 * row still renders, because the lookup is live.
 *
 * This is the one place that picks the cover, for Nexus and local attachments
 * alike (#2660): callers draw `coverImage` and check nothing again.
 *
 * @param params.content - The JSON stringified article content containing title and body
 * @param params.attachments - The file attachment URIs for the post
 * @param params.coverImageVariant - The variant to use when generating the cover image URL
 * @returns Object containing title, body, and coverImage
 *
 * @example
 * ```tsx
 * const { title, body, coverImage } = usePostArticle({
 *   content: '{"title":"My Article","body":"Article content..."}',
 *   attachments: ['pubky://user/pub/pubky.app/files/file-123'],
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
  // Slot-0 cover rule, computed synchronously from the published body so the
  // cover never flashes for articles whose slot 0 is an inline image.
  const hasInlineSlotZero = articleHasInlineSlotZero(body);
  const hasCover = Boolean(attachments?.length || localSlotZero || pendingSlotZero) && !hasInlineSlotZero;

  // Only the cover slot is relevant; inline attachments render inside the
  // article body and are never resolved here. An edit that replaces or removes
  // the cover derives a new result, so no stale cover can linger.
  const coverFileUri = hasCover ? attachments?.[0] : undefined;
  const { files, isLoading: isCoverLoading } = useAttachmentsMetadata({
    fileUris: coverFileUri ? [coverFileUri] : [],
    onError: () => toast({ variant: 'error', description: 'Could not load cover image' }),
  });
  // The row for *this* uri, not merely the first of a retained previous snapshot: when the
  // attachment is replaced, the old row must not carry its alt text onto the new cover.
  const coverFile = files.find((file) => file.uri === coverFileUri);

  // `pubkyUriToCdnUrl` ends in the same `filesApi.getFileUrl` the server preload
  // (`resolvePostCoverPreloadUrls`) resolves through, and both read the shared cover variants, so
  // the URL rendered here is the one the document already preloaded. It returns `null` for
  // anything that is not a homeserver file URI, which the CDN cannot serve.
  const coverSrc = pubkyUriToCdnUrl(coverFileUri, coverImageVariant);
  const coverDesktopSrc = coverImageDesktopVariant ? pubkyUriToCdnUrl(coverFileUri, coverImageDesktopVariant) : null;
  // The desktop fallback (`main`, the untouched upload) waits for the row to confirm an image: a
  // provisional slot 0 that turns out to be a video would otherwise pull its multi-megabyte original
  // through the `<img>` when `large` fails. A failure recorded before the row lands still swaps as
  // soon as it does.
  const coverDesktopFallbackSrc =
    coverFile && coverImageDesktopFallbackVariant
      ? pubkyUriToCdnUrl(coverFileUri, coverImageDesktopFallbackVariant)
      : null;
  // A local slot-0 entry already knows its type; otherwise only the row can say slot 0 is not an
  // image, or that Nexus no longer serves it (the lookup settles with no row). Until it lands the
  // cover is provisional. The local type counts only while the local list matches the attachment
  // list: right after an edit it already holds the new order while this render still shows the old
  // post, and a non-image in the new slot 0 must not veto the cover the old post still has.
  const localCoverType = localAttachments?.length === attachments?.length ? localSlotZero?.type : undefined;
  const coverType = localCoverType || coverFile?.content_type;
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

  const localCover = hasCover && localSlotZero?.type.startsWith('image') ? localSlotZero : null;
  // A `blob:` entry is a file this session uploaded or unlocked: served from memory, with no variant
  // Nexus derives from it, so it owns the desktop slot and has nothing to degrade to.
  //
  // A CDN entry is an attachment that was kept. It is seeded with its derived `large` URL, the one
  // the server preloaded, so the desktop slot renders that and a failed `large` degrades to the
  // entry's own `main`. An entry seeded without `large` resolves to the same file the remote cover
  // does, so it waits for that: holding the slot (no `srcset`, so a wide screen falls back to
  // `feed`) keeps the original upload off the wire until the preloaded variant is known. A cover
  // that never resolves still falls back to the local `main`, the only thing left to render.
  const localCoverOwnsDesktop = Boolean(localCover?.urls.main.startsWith('blob:'));
  const localCoverDesktopSrc = (() => {
    if (!localCover || !coverImageDesktopVariant) return undefined;
    if (localCoverOwnsDesktop) return localCover.urls.main;
    if (localCover.urls.large) return localCover.urls.large;
    if (isCoverLoading) return undefined;
    return remoteCoverImage?.desktopSrc ?? localCover.urls.main;
  })();
  const localCoverImage: CoverImage | null = localCover
    ? {
        src: localCover.urls.feed ?? localCover.urls.main,
        desktopSrc: localCoverDesktopSrc,
        desktopFallbackSrc: coverImageDesktopVariant && !localCoverOwnsDesktop ? localCover.urls.main : undefined,
        alt: localCover.name,
        width: localCover.width,
        height: localCover.height,
      }
    : null;

  const coverImage = localCoverImage ?? remoteCoverImage;

  return {
    title,
    body,
    coverImage,
    // A video in slot 0 never becomes a cover, so nothing holds a box for it.
    isCoverPending: hasCover && !coverImage && Boolean(pendingSlotZero?.type.startsWith('image')),
    isCoverLoading: isCoverLoading && !localCoverImage,
  };
}
