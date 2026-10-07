'use client';

import { useEffect, useState } from 'react';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { parseArticleContent } from '@/libs/post/articleContent';
import { articleHasInlineSlotZero } from '@/libs/post/articleInlineImages';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { toast } from '@/molecules/Toaster/toast';
import type { FileVariant } from '@/services/nexus/file/file.types';

interface CoverImage {
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
   * Attachments the caller holds locally. Unlocked content has no Nexus attachments at all — the
   * bytes live in the reader's own `/priv` — so without this its cover would never count as one.
   *
   * TODO:[Locks] #2660 — a count only answers "is there a slot 0"; whether slot 0 is an image is
   * decided again in `PostArticle`, so the two can disagree. Take the attachments here instead.
   */
  localAttachmentCount?: number;
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
  coverImage: CoverImage | null;
  /**
   * Slot-0 cover rule: attachments[0] is the cover unless the body references
   * `attachment:0` (then slot 0 is an inline image and the article has no
   * cover). Callers must gate any locally sourced cover on this too.
   */
  hasCover: boolean;
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
  localAttachmentCount,
  coverImageDesktopVariant,
  coverImageDesktopFallbackVariant,
}: UsePostArticleParams): UsePostArticleResult {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    const parsed = parseArticleContent(content);

    if (parsed) {
      setTitle(parsed.title);
      setBody(parsed.body);
    } else {
      setTitle('');
      setBody('');
      toast({
        variant: 'error',
        description: 'Could not parse article content',
      });
    }
  }, [content]);

  // Slot-0 cover rule, computed synchronously from the published body so the
  // cover never flashes for articles whose slot 0 is an inline image.
  const hasInlineSlotZero = articleHasInlineSlotZero(parseArticleContent(content)?.body ?? '');
  const hasCover = Boolean(attachments?.length || localAttachmentCount) && !hasInlineSlotZero;

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
  // Only the row can say slot 0 is not an image, or that Nexus no longer serves it (the lookup
  // settles with no row). Until it lands the cover is provisional.
  const isCoverUnavailable = coverFile ? !coverFile.content_type.startsWith('image') : !isCoverLoading;

  const width = Number(coverFile?.metadata?.width);
  const height = Number(coverFile?.metadata?.height);
  const coverImage: CoverImage | null =
    coverSrc && !isCoverUnavailable
      ? {
          src: coverSrc,
          desktopSrc: coverDesktopSrc ?? undefined,
          desktopFallbackSrc: coverDesktopFallbackSrc ?? undefined,
          alt: coverFile?.name ?? '',
          ...(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : {}),
        }
      : null;

  return {
    title,
    body,
    coverImage,
    hasCover,
    isCoverLoading,
  };
}
