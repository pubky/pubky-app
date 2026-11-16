'use client';

import { type SyntheticEvent, useState } from 'react';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import type { CoverImage } from '@/hooks/usePostArticle/usePostArticle';
import { POST_COVER_DESKTOP_MEDIA } from '@/libs/post/postCoverVariant';
import type { ArticleMediaSource } from '@/molecules/ArticleInlineMedia/ArticleInlineMedia.types';
import { PostText } from '@/molecules/PostText/PostText';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';

interface ArticleReaderProps {
  body: string;
  coverImage: CoverImage | null;
  isCoverPending: boolean;
  /** Where the body's `attachment:{n}` media comes from: Nexus, or the copy an unlocked reader holds. */
  articleMedia: ArticleMediaSource;
  /**
   * The cover is the page's largest contentful paint: fetched eager and at high priority so it is not
   * queued behind the images below the fold. Off for a reader opened inside a list.
   */
  priority?: boolean;
}

/** An article's cover and full body; the title and the page chrome are the caller's. */
export function ArticleReader({ body, coverImage, isCoverPending, articleMedia, priority }: ArticleReaderProps) {
  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  // `large` is derived on request and 400s until the Nexus deploy that carries it is out, so the
  // hero drops the desktop candidate to `main` when it fails to load. The phone candidate is
  // `feed` and is left alone: one failed request, and no multi-megabyte upload pulled onto a
  // phone. The failed URL (not a bare boolean) is remembered, so a later cover on the same mount
  // starts on `large` again, and re-firing `error` for a URL already recorded is a no-op: no loop.
  // Only a failure of the desktop candidate counts: a phone whose `feed` fails never requested
  // `large`, so widening past the breakpoint later must still try it. An empty `currentSrc` gives
  // no way to tell which candidate failed, so it is treated as the desktop one.
  const [failedDesktopSrc, setFailedDesktopSrc] = useState<string | null>(null);
  const handleCoverError = (event: SyntheticEvent<HTMLImageElement>) => {
    const desktopSrc = coverImage?.desktopSrc;
    const failedSrc = event.currentTarget.currentSrc;
    if (!desktopSrc || (failedSrc && failedSrc !== desktopSrc)) return;
    setFailedDesktopSrc(desktopSrc);
  };
  const desktopCoverFailed = Boolean(coverImage?.desktopSrc) && failedDesktopSrc === coverImage?.desktopSrc;
  const desktopCoverSrc = desktopCoverFailed
    ? (coverImage?.desktopFallbackSrc ?? coverImage?.desktopSrc)
    : coverImage?.desktopSrc;

  return (
    <>
      {isCoverPending && <Skeleton className="mb-6 aspect-video w-full rounded-md" />}
      {coverImage && (
        // A `<picture>` rather than the `Image` atom: next/image drops a custom `srcSet` when
        // it is `unoptimized` (every external CDN URL is), and a breakpoint is the only way to
        // keep a high-DPR phone off the original upload. See POST_COVER_MOBILE_VARIANT.
        <picture>
          <source media={POST_COVER_DESKTOP_MEDIA} srcSet={desktopCoverSrc} />
          <img
            src={coverImage.src}
            alt={coverImage.alt}
            width={800}
            height={600}
            loading={priority ? 'eager' : undefined}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            // Fires for whichever candidate the browser selected. On a wide screen that is the
            // desktop `<source>`, and this is what swaps it to `main` when `large` is not served.
            onError={handleCoverError}
            className="mb-6 aspect-video w-full rounded-md object-cover object-center"
          />
        </picture>
      )}

      <PostText content={body} isArticle fullArticle articleMedia={articleMedia} onLinkClick={handleLinkClick} />

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
}
