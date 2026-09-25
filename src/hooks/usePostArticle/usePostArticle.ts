'use client';

import { useEffect, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
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
}

/**
 * Custom hook to extract article data from post content and attachments
 *
 * The cover is resolved through `useAttachmentsMetadata`, so it appears as soon
 * as the file row lands — a cover whose metadata was persisted after the post
 * row no longer stays missing until the article remounts.
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
  const hasCover = Boolean(attachments?.length) && !hasInlineSlotZero;

  // Only the cover slot is relevant; inline attachments render inside the
  // article body and are never resolved here. An edit that replaces or removes
  // the cover derives a new result, so no stale cover can linger.
  const coverFileUri = hasCover ? attachments?.[0] : undefined;
  const { files } = useAttachmentsMetadata({
    fileUris: coverFileUri ? [coverFileUri] : [],
    onError: () => toast({ variant: 'error', description: 'Could not load cover image' }),
  });
  const coverFile = files[0];

  const coverImage: CoverImage | null =
    coverFile && coverFile.content_type.startsWith('image')
      ? {
          src: FileController.getFileUrl({ fileId: coverFile.id, variant: coverImageVariant }),
          desktopSrc: coverImageDesktopVariant
            ? FileController.getFileUrl({ fileId: coverFile.id, variant: coverImageDesktopVariant })
            : undefined,
          desktopFallbackSrc: coverImageDesktopFallbackVariant
            ? FileController.getFileUrl({ fileId: coverFile.id, variant: coverImageDesktopFallbackVariant })
            : undefined,
          alt: coverFile.name,
        }
      : null;

  return {
    title,
    body,
    coverImage,
    hasCover,
  };
}
