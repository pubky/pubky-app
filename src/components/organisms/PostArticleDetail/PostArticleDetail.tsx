'use client';

import { type SyntheticEvent, useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import {
  POST_COVER_DESKTOP_FALLBACK_VARIANT,
  POST_COVER_DESKTOP_MEDIA,
  POST_COVER_DESKTOP_VARIANT,
  POST_COVER_MOBILE_VARIANT,
} from '@/libs/post/postCoverVariant';
import { cn } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostText } from '@/molecules/PostText/PostText';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { useHomeStore } from '@/stores/home/home.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInlineTagsActions } from '../PostInlineTagsActions/PostInlineTagsActions';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';

interface PostArticleDetailProps {
  postId: string;
  content: string;
  attachments: PostDetailsModel['attachments'];
  isBlurred: boolean;
}

/**
 * Displays an article post detail page.
 * Columns reuses the regular post inline tags/actions; wide and list use a side tags column.
 * Any other layout value (visual, or a future one) renders as columns, the same rule
 * `getTagsLayoutForSurfaceLayout` applies to the rest of the single-post surface.
 */
export const PostArticleDetail = ({ postId, content, attachments, isBlurred }: PostArticleDetailProps) => {
  const layout = useHomeStore((state) => state.layout);
  const isColumnsLayout = getTagsLayoutForSurfaceLayout(layout) === 'inline';
  const { openReplyDialog, openRepostDialog, dialogs } = usePostReplyRepostDialogs(postId);
  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const isMobile = useIsMobile();

  const handleTagClick = () => {
    // The tag button only reveals the tags. On mobile that reveal must not focus the input and pop
    // the soft keyboard: the `[+]` add control owns autofocus. It still has to bring the panel
    // into view, which the desktop path gets from `focus()` as a side effect.
    if (isMobile) {
      mobileTagsPanelRef.current?.reveal();
      return;
    }
    mobileTagsPanelRef.current?.focus();
    desktopTagsPanelRef.current?.focus();
  };

  const { title, body, coverImage, hasCover, isCoverLoading } = usePostArticle({
    content,
    attachments,
    // Both variants come from the same constants the server-side preload reads, so the
    // preloaded URL is the one this image asks for and the cover downloads once.
    coverImageVariant: POST_COVER_MOBILE_VARIANT,
    coverImageDesktopVariant: POST_COVER_DESKTOP_VARIANT,
    coverImageDesktopFallbackVariant: POST_COVER_DESKTOP_FALLBACK_VARIANT,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  const localAttachments = useLocalFilesStore((s) => s.posts[postId]);

  // Local entries are index-aligned with attachments; slot 0 is the cover
  // only when the slot-0 rule says so (otherwise it's an inline image).
  const localCover = hasCover && localAttachments?.[0]?.type.startsWith('image') ? localAttachments[0] : null;

  // A `blob:` entry is a file this session uploaded: served from memory, with no variant Nexus
  // derives from it, so it owns the desktop slot and has nothing to degrade to.
  //
  // A CDN entry is an attachment that was kept. It is seeded with its derived `large` URL, the one
  // the server preloaded, so the desktop slot renders that and a failed `large` degrades to the
  // entry's own `main`. An entry seeded without `large` resolves to the same file the remote cover
  // does, so it waits for that: holding the slot (no `srcset`, so a wide screen falls back to
  // `feed`) keeps the original upload off the wire until the preloaded variant is known. A cover
  // that never resolves still falls back to the local `main`, the only thing left to render.
  const localCoverOwnsDesktop = Boolean(localCover?.urls.main.startsWith('blob:'));
  const localCoverDesktopSrc = (() => {
    if (!localCover) return undefined;
    if (localCoverOwnsDesktop) return localCover.urls.main;
    if (localCover.urls.large) return localCover.urls.large;
    if (isCoverLoading) return undefined;
    return coverImage?.desktopSrc ?? localCover.urls.main;
  })();

  const localCoverImage = localCover
    ? {
        src: localCover.urls.feed ?? localCover.urls.main,
        desktopSrc: localCoverDesktopSrc,
        desktopFallbackSrc: localCoverOwnsDesktop ? undefined : localCover.urls.main,
        alt: localCover.name,
      }
    : null;

  const finalCoverImage = localCoverImage || coverImage;

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
    const desktopSrc = finalCoverImage?.desktopSrc;
    const failedSrc = event.currentTarget.currentSrc;
    if (!desktopSrc || (failedSrc && failedSrc !== desktopSrc)) return;
    setFailedDesktopSrc(desktopSrc);
  };
  const desktopCoverFailed = Boolean(finalCoverImage?.desktopSrc) && failedDesktopSrc === finalCoverImage?.desktopSrc;
  const desktopCoverSrc = desktopCoverFailed
    ? (finalCoverImage?.desktopFallbackSrc ?? finalCoverImage?.desktopSrc)
    : finalCoverImage?.desktopSrc;

  const articleAuthorId = (() => {
    try {
      return parseCompositeId(postId).pubky;
    } catch {
      return '';
    }
  })();

  const articleHeader = (
    <>
      <Typography as="h1" size="2xl" className="mb-6 wrap-anywhere">
        {title}
      </Typography>

      <PostHeader postId={postId} size="extraLarge" timeAgoPlacement="bottom-left" />

      {isColumnsLayout ? (
        <PostInlineTagsActions
          postId={postId}
          onReplyClick={openReplyDialog}
          onRepostClick={openRepostDialog}
          className="mt-3 mb-6"
        />
      ) : (
        <PostActionsBar
          postId={postId}
          onTagClick={handleTagClick}
          onReplyClick={openReplyDialog}
          onRepostClick={openRepostDialog}
          className="mt-3 mb-6"
        />
      )}
    </>
  );

  const articleBody = isBlurred ? (
    <PostContentBlurred postId={postId} />
  ) : (
    <>
      {finalCoverImage && (
        // A `<picture>` rather than the `Image` atom: next/image drops a custom `srcSet` when
        // it is `unoptimized` (every external CDN URL is), and a breakpoint is the only way to
        // keep a high-DPR phone off the original upload. See POST_COVER_MOBILE_VARIANT.
        <picture>
          <source media={POST_COVER_DESKTOP_MEDIA} srcSet={desktopCoverSrc} />
          <img
            src={finalCoverImage.src}
            alt={finalCoverImage.alt}
            width={800}
            height={600}
            // The cover is this page's largest contentful paint: eager + high priority
            // so it is not queued behind the images below the fold.
            loading="eager"
            fetchPriority="high"
            decoding="async"
            // Fires for whichever candidate the browser selected. On a wide screen that is the
            // desktop `<source>`, and this is what swaps it to `main` when `large` is not served.
            onError={handleCoverError}
            className="mb-6 aspect-video w-full rounded-md object-cover object-center"
          />
        </picture>
      )}

      <PostText
        content={body}
        isArticle
        fullArticle
        articleImages={{ attachments: attachments ?? [], authorId: articleAuthorId, postId }}
        onLinkClick={handleLinkClick}
      />
    </>
  );

  return (
    <>
      <Container className={cn('mb-6 gap-6', !isColumnsLayout && 'grid grid-cols-1 lg:grid-cols-3')}>
        <Container className={cn(!isColumnsLayout && 'lg:col-span-2')}>
          {articleHeader}
          {articleBody}
          {!isColumnsLayout && (
            <PostTagsPanel ref={mobileTagsPanelRef} postId={postId} widthMode="full" className="mt-6 flex lg:hidden" />
          )}
        </Container>

        {!isColumnsLayout && (
          <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="hidden lg:flex" />
        )}
      </Container>

      {dialogs}
      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
