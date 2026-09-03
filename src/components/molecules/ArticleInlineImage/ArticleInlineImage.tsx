'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { ArticleInlineImageProps } from './ArticleInlineImage.types';
import { resolveArticleImageSrc } from './ArticleInlineImage.utils';

/**
 * Renders one inline image inside an article body.
 *
 * `attachment:{n}` destinations resolve through the post's attachments (author
 * ownership enforced); same-session uploads prefer the local files store entry
 * so freshly published images render before the CDN generates variants.
 * Invalid destinations render an unavailable placeholder without any network
 * request; images that fail to load degrade to the same placeholder.
 *
 * Rendered inside markdown paragraphs, so both the image and the placeholder
 * are phrasing-safe (`img` / `span`) — no block elements.
 */
export const ArticleInlineImage = ({ src, alt, attachments, authorId, postId }: ArticleInlineImageProps) => {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const localAttachments = useLocalFilesStore((state) => state.posts[postId]);

  const resolved = resolveArticleImageSrc({ src, attachments, authorId });

  // Local entries are index-aligned with attachments; the store only holds
  // image object URLs for posts created/edited this session. The length guard
  // mirrors useEditAttachments: right after an edit the store already has the
  // NEW order while this render still shows the stale body — indexing across
  // that mismatch would serve the wrong image.
  const alignedLocalAttachments = localAttachments?.length === attachments.length ? localAttachments : undefined;
  const localUrl =
    resolved.kind === 'attachment' && alignedLocalAttachments?.[resolved.index]?.type.startsWith('image')
      ? alignedLocalAttachments[resolved.index].urls.main
      : undefined;

  const finalSrc = resolved.kind === 'invalid' ? null : (localUrl ?? resolved.url);

  // A new source deserves a fresh attempt: without this, one failed load
  // (e.g. a CDN variant that wasn't ready) latches the placeholder even after
  // an edit or store update points the slot at a working URL
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [finalSrc]);

  if (!finalSrc || failed) {
    return (
      <span
        role="img"
        aria-label={alt || 'Image unavailable'}
        data-testid="article-inline-image-fallback"
        className={cn(
          'my-4 inline-flex max-w-full items-center gap-2 rounded-md border border-dashed border-input',
          'px-4 py-3 text-sm text-muted-foreground',
        )}
      >
        <ImageOff aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{alt || 'Image unavailable'}</span>
      </span>
    );
  }

  return (
    <>
      {/* Reserves space and gives feedback while the image loads (slow CDN
          responses can hang for many seconds before settling or erroring).
          Span-based skeleton: this renders inside markdown paragraphs. */}
      {!loaded && (
        <span
          aria-hidden="true"
          data-testid="article-inline-image-loading"
          className="my-4 block aspect-video w-full max-w-full animate-pulse rounded-md bg-muted"
        />
      )}
      {/* Kept mounted (tiny, invisible) while loading so the fetch and
          lazy-loading intersection still run */}
      {/* eslint-disable-next-line @next/next/no-img-element -- needs onError fallback; the Image atom (next/image) has none */}
      <img
        src={finalSrc}
        alt={alt ?? ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        data-testid="article-inline-image"
        className={cn('my-4 h-auto max-w-full rounded-md', !loaded && 'absolute h-px w-px opacity-0')}
      />
    </>
  );
};
