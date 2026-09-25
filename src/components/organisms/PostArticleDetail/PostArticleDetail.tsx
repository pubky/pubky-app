'use client';

import { useRef, useState } from 'react';
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
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
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
 * Columns reuses the regular post inline tags/actions; other layouts use a side tags column.
 */
export const PostArticleDetail = ({ postId, content, attachments, isBlurred }: PostArticleDetailProps) => {
  const layout = useHomeStore((state) => state.layout);
  const isColumnsLayout = layout === LAYOUT.COLUMNS;
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

  const { title, body, coverImage, hasCover } = usePostArticle({
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
  const localCoverImage =
    hasCover && localAttachments?.[0]?.type.startsWith('image')
      ? {
          src: localAttachments[0].urls.feed ?? localAttachments[0].urls.main,
          desktopSrc: localAttachments[0].urls.main,
          // A local file is served from memory, not Nexus, so it has no derived-size fallback.
          desktopFallbackSrc: undefined,
          alt: localAttachments[0].name,
        }
      : null;

  const finalCoverImage = localCoverImage || coverImage;

  // `large` is derived on request and 400s until the Nexus deploy that carries it is out, so the
  // hero drops the desktop candidate to `main` when it fails to load. The phone candidate is
  // `feed` and is left alone: one failed request, and no multi-megabyte upload pulled onto a
  // phone. The failed URL (not a bare boolean) is remembered, so a later cover on the same mount
  // starts on `large` again, and re-firing `error` for a URL already recorded is a no-op: no loop.
  const [failedDesktopSrc, setFailedDesktopSrc] = useState<string | null>(null);
  const handleCoverError = () => setFailedDesktopSrc(finalCoverImage?.desktopSrc ?? null);
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
