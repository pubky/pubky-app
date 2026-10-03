'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, FileX, type LucideIcon, VideoOff, VolumeX } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Button } from '@/atoms/Button/Button';
import { Link } from '@/atoms/Link/Link';
import { Video } from '@/atoms/Video/Video';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { cn } from '@/libs/utils/utils';
import { ArticleInlineImage } from '@/molecules/ArticleInlineImage/ArticleInlineImage';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { ArticleInlineMediaProps } from './ArticleInlineMedia.types';
import { resolveArticleMedia } from './ArticleInlineMedia.utils';

const FALLBACK_CLASSNAME = cn(
  'my-4 inline-flex max-w-full items-center gap-2 rounded-md border border-dashed border-input',
  'px-4 py-3 text-sm text-muted-foreground',
);

/** The dashed placeholder of `ArticleInlineImage`, for a slot that cannot play or never could. */
const MediaFallback = ({ Icon, label }: { Icon: LucideIcon; label: string }) => (
  <span role="img" aria-label={label} data-testid="article-inline-media-fallback" className={FALLBACK_CLASSNAME}>
    <Icon aria-hidden="true" className="size-4 shrink-0" />
    <span className="min-w-0 truncate">{label}</span>
  </span>
);

/**
 * Renders one inline media node of an article body: the image path is `ArticleInlineImage`,
 * untouched; videos and audio get the native players; a PDF gets a file card. Which one is a
 * decision made from file metadata, never from the markdown (see `resolveArticleMedia`).
 *
 * Rendered inside markdown paragraphs, so everything here is phrasing content (`span`, `video`,
 * `audio`, `a`) — no block elements. External sources never preload: media elements carry no
 * referrer policy, so the first request to a third-party host waits for the reader to press play.
 * Each player is paused on its own once the reader scrolls past it, as post attachments are.
 */
export const ArticleInlineMedia = ({ src, alt, ...source }: ArticleInlineMediaProps) => {
  const [failed, setFailed] = useState(false);
  const localStoreAttachments = useLocalFilesStore((state) =>
    'postId' in source ? state.posts[source.postId] : undefined,
  );

  const pauseContainerRef = usePauseMediaOutsideViewport();

  const resolved = resolveArticleMedia({ src, alt, ...source, localStoreAttachments });
  const mediaUrl = 'url' in resolved ? resolved.url : null;

  // A new source deserves a fresh attempt, as in ArticleInlineImage: one failed load must not
  // latch the placeholder after an edit or store update points the slot at a working URL
  useEffect(() => {
    setFailed(false);
  }, [mediaUrl]);

  if (resolved.kind === 'image') {
    return 'localAttachments' in source ? (
      <ArticleInlineImage src={src} alt={alt} localAttachments={source.localAttachments} />
    ) : (
      <ArticleInlineImage
        src={src}
        alt={alt}
        attachments={source.attachments}
        authorId={source.authorId}
        postId={source.postId}
      />
    );
  }

  if (resolved.kind === 'loading') {
    return (
      <span
        aria-hidden="true"
        data-testid="article-inline-media-loading"
        className="my-4 block aspect-video w-full max-w-full animate-pulse rounded-md bg-muted"
      />
    );
  }

  if (resolved.kind === 'unsupported') {
    return <MediaFallback Icon={FileX} label={alt || 'File unavailable'} />;
  }

  if (resolved.kind === 'pdf') {
    // The author's description wins when they wrote one; the file name is the next best label
    const label = alt?.trim() || resolved.name || 'PDF document';
    return (
      <span
        data-testid="article-inline-file"
        className="my-4 flex max-w-full items-center justify-between gap-2 rounded-md bg-muted p-4"
      >
        <span className="flex min-w-0 items-center gap-x-2">
          <FileText aria-hidden="true" className="size-6 shrink-0" />
          <span className="min-w-0 truncate text-sm font-bold">{label}</span>
        </span>
        <Button asChild variant="dark" size="icon" className="h-8 w-10 shrink-0 border-none bg-card hover:bg-card/70">
          <Link overrideDefaults href={resolved.url} target="_blank" rel="noopener noreferrer" aria-label="Open PDF">
            <Download className="size-4" />
          </Link>
        </Button>
      </span>
    );
  }

  if (failed) {
    return resolved.kind === 'video' ? (
      <MediaFallback Icon={VideoOff} label={alt || 'Video unavailable'} />
    ) : (
      <MediaFallback Icon={VolumeX} label={alt || 'Audio unavailable'} />
    );
  }

  const preload = resolved.external ? 'none' : 'metadata';

  // The observed element is the player itself (the hook pauses the media inside its container), so a
  // long article does not keep a scrolled-past player going while any part of it is still on screen
  return (
    <span ref={pauseContainerRef} className="my-4 block">
      {resolved.kind === 'video' ? (
        <Video
          src={resolved.url}
          controls
          playsInline
          preload={preload}
          aria-label={alt || undefined}
          onError={() => setFailed(true)}
          data-testid="article-inline-video"
          className="aspect-video w-full"
        />
      ) : (
        <Audio
          src={resolved.url}
          controls
          preload={preload}
          aria-label={alt || undefined}
          onError={() => setFailed(true)}
          data-testid="article-inline-audio"
        />
      )}
    </span>
  );
};
