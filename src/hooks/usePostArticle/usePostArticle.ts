'use client';

import { useEffect, useState } from 'react';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { parseArticleContent } from '@/libs/post/articleContent';
import { articleHasInlineSlotZero } from '@/libs/post/articleInlineImages';
import { resolvePostAttachmentUrl } from '@/libs/post/postAttachmentUrl';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { toast } from '@/molecules/Toaster/toast';
import type { FileVariant } from '@/services/nexus/file/file.types';

interface CoverImage {
  src: string;
  /** Set when a desktop variant was requested: the same file at its larger size. */
  desktopSrc?: string;
  alt: string;
  width?: number;
  height?: number;
}

interface UsePostArticleParams {
  content: string;
  attachments: PostDetailsModel['attachments'];
  coverImageVariant: FileVariant;
  /**
   * Second, larger source for surfaces that render the cover at full width (the article hero).
   * Left unset by feed-sized surfaces, which never want the original upload.
   */
  coverImageDesktopVariant?: FileVariant;
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
 * The cover URL is a pure function of the attachment URI and the variant
 * (`resolvePostAttachmentUrl`, the same resolver the server-side preload uses),
 * so it exists on the first render that has post details — no file-metadata
 * round trip stands in front of the hero. The metadata lookup only refines the
 * result: it supplies the alt text and the intrinsic size, and it can still veto
 * a slot 0 whose row turns out not to be an image. A cover whose metadata was
 * persisted after the post row therefore no longer stays missing until the
 * article remounts.
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
  coverImageDesktopVariant,
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
  const hasCover = Boolean(attachments?.length) && !hasInlineSlotZero;

  // Only the cover slot is relevant; inline attachments render inside the
  // article body and are never resolved here. An edit that replaces or removes
  // the cover derives a new result, so no stale cover can linger.
  const coverFileUri = hasCover ? attachments?.[0] : undefined;
  // No `onError` here on purpose: the cover no longer depends on this lookup, so a failure only
  // costs the alt text. Reporting "could not load cover image" while the derived cover renders
  // would be a false alarm.
  const { files, isLoading: isCoverLoading } = useAttachmentsMetadata({
    fileUris: coverFileUri ? [coverFileUri] : [],
  });
  // The row for *this* uri, not merely the first of a retained previous snapshot: when the
  // attachment is replaced, the old row must not carry its alt text onto the new cover.
  const coverFile = files.find((file) => file.uri === coverFileUri);

  // The cover's CDN URL is a pure function of the attachment URI and the variant, so it is known
  // the moment the post details are — the file-metadata lookup never gates first paint. This is
  // the same URL the server preload (`resolvePostCoverPreloadUrls`) and the `<picture>` in
  // PostArticleDetail build from the shared variants, so a viewport still downloads the cover
  // once. `resolvePostAttachmentUrl` returns `null` for anything that is not a homeserver file
  // URI, so a slot 0 the CDN cannot serve renders no cover.
  const coverSrc = coverFileUri ? resolvePostAttachmentUrl(coverFileUri, coverImageVariant) : null;
  const coverDesktopSrc =
    coverFileUri && coverImageDesktopVariant ? resolvePostAttachmentUrl(coverFileUri, coverImageDesktopVariant) : null;

  let coverImage: CoverImage | null = null;
  if (coverSrc) {
    if (coverFile && !coverFile.content_type.startsWith('image')) {
      // Slot 0 resolved to a file that is not an image: only the metadata row can say that, so
      // the provisional cover is dropped once the row lands.
      coverImage = null;
    } else {
      const width = Number(coverFile?.metadata?.width);
      const height = Number(coverFile?.metadata?.height);
      coverImage = {
        src: coverSrc,
        desktopSrc: coverDesktopSrc ?? undefined,
        alt: coverFile?.name ?? '',
        ...(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : {}),
      };
    }
  }

  return {
    title,
    body,
    coverImage,
    hasCover,
    isCoverLoading,
  };
}
