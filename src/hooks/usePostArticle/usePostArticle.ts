'use client';

import { useEffect, useState } from 'react';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { parseArticleContent } from '@/libs/post/articleContent';
import { resolveArticleCover } from '@/libs/post/articleCover';
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
   * Content type of the caller's local slot-0 entry, when it holds one (a same-session publish or
   * unlocked content). A known non-image vetoes the provisional cover at once instead of painting a
   * broken image until the file row says the same.
   */
  localCoverType?: string;
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
   * Whether the article has a cover: the envelope's `cover_image`, or slot 0 of a 0.x article
   * unless the body references `attachment:0` (`resolveArticleCover`). Callers must gate any
   * locally sourced cover on this too.
   */
  hasCover: boolean;
  isCoverLoading: boolean;
}

/**
 * Custom hook to extract article data from post content and attachments
 *
 * The cover URL is a pure function of the cover URI and the variant, so it
 * exists on the first render that has post details: no file-metadata round trip
 * stands in front of the hero. The metadata row is a progressive refinement (alt
 * text, intrinsic size) and stays authoritative once the lookup settles: a row
 * that is not an image, or a lookup that settles with no row, drops the cover,
 * as it did when the cover waited for the row. A row persisted after the post
 * row still renders, because the lookup is live.
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
  localAttachmentCount,
  localCoverType,
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

  // Where the cover is, computed synchronously from the envelope and the published body so the
  // cover never flashes for articles whose slot 0 is an inline image. Unlocked (Locks) content has
  // no Nexus attachments at all, its files are the reader's own: it keeps the slot-0 convention,
  // so a local slot 0 is its cover exactly when the slot-0 rule says so.
  const resolved = resolveArticleCover({ content, attachments });
  const hasCover = resolved.cover !== null || (Boolean(localAttachmentCount) && resolved.legacyCoverSlot);

  // Only the cover is relevant; inline attachments render inside the
  // article body and are never resolved here. An edit that replaces or removes
  // the cover derives a new result, so no stale cover can linger.
  const coverFileUri = resolved.cover ?? undefined;
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
  // cover is provisional.
  const coverType = localCoverType || coverFile?.content_type;
  const isCoverUnavailable = coverType ? !coverType.startsWith('image') : !isCoverLoading;

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
