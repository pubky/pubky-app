'use client';

import { useEffect, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import { parseArticleContent } from '@/libs/post/articleContent';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { useToast } from '@/molecules/Toaster/use-toast';
import type { FileVariant } from '@/services/nexus/file/file.types';

interface CoverImage {
  src: string;
  alt: string;
}

interface UsePostArticleParams {
  content: string;
  attachments: PostDetailsModel['attachments'];
  coverImageVariant: FileVariant;
}

interface UsePostArticleResult {
  title: string;
  body: string;
  coverImage: CoverImage | null;
}

/**
 * Custom hook to extract article data from post content and attachments
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
}: UsePostArticleParams): UsePostArticleResult {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [coverImage, setCoverImage] = useState<CoverImage | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
  }, [content]);

  useEffect(() => {
    let cancelled = false;

    const extractCoverImage = async () => {
      // An edit can remove the cover — clear previously extracted state
      if (!attachments?.length) {
        setCoverImage(null);
        return;
      }

      try {
        const attachment = (await FileController.getMetadata({ fileAttachments: attachments }))[0];

        if (cancelled) return;

        if (attachment && attachment.content_type.startsWith('image')) {
          const src = FileController.getFileUrl({ fileId: attachment.id, variant: coverImageVariant });
          const coverImage = { src, alt: attachment.name };
          setCoverImage(coverImage);
        } else {
          setCoverImage(null);
        }
      } catch {
        if (cancelled) return;

        // Clear on failure too — an edit can have replaced or removed the
        // cover, and keeping the previously extracted one would render stale
        setCoverImage(null);
        toast({
          variant: 'error',
          description: 'Could not load cover image',
        });
      }
    };

    extractCoverImage();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
  }, [attachments, coverImageVariant]);

  return {
    title,
    body,
    coverImage,
  };
}
