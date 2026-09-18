'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getUserProfileUrl } from '@/app/routes';
import { TagKind } from '@/application/tag/tag.types';
import { CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { cn, formatPublicKey, isPostDeleted } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import { PostListMediaThumbnail } from '@/molecules/PostListMediaThumbnail/PostListMediaThumbnail';
import { truncateAtWordBoundary } from '@/molecules/PostText/PostText.utils';
import { PostUnavailable } from '@/molecules/PostUnavailable/PostUnavailable';
import { UserInfoPopover } from '@/molecules/UserInfoPopover/UserInfoPopover';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useAuthStore } from '@/stores/auth/auth.store';
import { ClickableTagsList } from '../../ClickableTagsList/ClickableTagsList';
import { PostActionsBar } from '../../PostActionsBar/PostActionsBar';
import { PostContent } from '../../PostContent/PostContent';
import { PostContentBlurred } from '../../PostContentBlurred/PostContentBlurred';
import { PostTagsPanel } from '../../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../../PostTagsPanel/PostTagsPanel.types';
import { LIST_POST_BODY_TEXT_CLASS } from '../PostMainTypography';
import { PostMainListRowSkeleton } from './PostMainListRow.skeleton';

const LIST_SNIPPET_MAX_CHARS = 120;

const stopCardPropagation = (event: React.MouseEvent) => event.stopPropagation();

function getListPostSnippet(content: string, kind: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }

  if (kind === 'long') {
    try {
      const parsed = JSON.parse(trimmed) as { title?: unknown; body?: unknown };
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
      return title || body;
    } catch {
      return trimmed;
    }
  }

  if (kind === 'collection') {
    const collection = parseCollectionContent(trimmed);
    if (!collection) {
      return trimmed;
    }

    const name = collection.name.trim();
    const description = collection.description?.trim() ?? '';
    return name || description;
  }

  return trimmed;
}

interface PostMainListRowProps {
  postId: string;
  savePostId?: string;
  showFullContent: boolean;
  shouldShowPostHeader: boolean;
  onReplyClick: (postId: string) => void;
  onRepostClick: (postId: string) => void;
}

export function PostMainListRow({
  postId,
  savePostId = postId,
  showFullContent,
  shouldShowPostHeader,
  onReplyClick,
  onRepostClick,
}: PostMainListRowProps) {
  const { postDetails } = usePostDetails(postId);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { isRepost, isReply, originalPostId } = useRepostInfo(postId);
  const { postDetails: originalPostDetails } = usePostDetails(originalPostId);
  const ownContentSnippet = getListPostSnippet(postDetails?.content ?? '', postDetails?.kind ?? '');
  const hasOwnAttachments = (postDetails?.attachments?.length ?? 0) > 0;
  const shouldPreviewOriginal =
    !showFullContent &&
    isRepost &&
    !ownContentSnippet &&
    !hasOwnAttachments &&
    !!originalPostId &&
    !!originalPostDetails;
  // An embedded reply keeps its own author/actions while previewing the embed.
  const shouldUseOriginalPost = shouldPreviewOriginal && !isReply;
  const previewPostId = shouldPreviewOriginal ? originalPostId : postId;
  const previewPostDetails = shouldPreviewOriginal ? originalPostDetails : postDetails;
  const displayPostId = shouldUseOriginalPost ? originalPostId : postId;
  const displayUserId = displayPostId.split(':')[0];
  const { userDetails } = useUserDetails(displayUserId);
  const avatarUrl = useAvatarUrl(userDetails);
  const { formatRelativeTime } = useRelativeTime();
  const tagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const isMobile = useIsMobile();

  // The panel mounts on expand. On mobile its reveal must not focus the input, so the scroll that
  // `focus()` used to perform has to happen here, after the panel exists.
  useEffect(() => {
    if (isMobile && tagsExpanded) tagsPanelRef.current?.reveal();
  }, [isMobile, tagsExpanded]);

  const displayPostDetails = shouldUseOriginalPost ? originalPostDetails : postDetails;

  if (!postDetails || !displayPostDetails || !previewPostDetails) {
    return <PostMainListRowSkeleton />;
  }

  if (isPostDeleted(displayPostDetails.content) || isPostDeleted(previewPostDetails.content)) {
    return <PostUnavailable message={'This post has been deleted by its author.'} />;
  }

  if (!userDetails) {
    return <PostMainListRowSkeleton />;
  }

  const indexedAt = new Date(displayPostDetails.indexed_at);
  const timeAgo = formatRelativeTime(indexedAt);
  const formattedPublicKey = formatPublicKey({ key: displayUserId });
  const contentSnippet = getListPostSnippet(previewPostDetails.content, previewPostDetails.kind);
  const snippet = showFullContent ? '' : truncateAtWordBoundary(contentSnippet, LIST_SNIPPET_MAX_CHARS);
  const profileUrl = getUserProfileUrl(displayUserId, currentUserPubky);
  const shouldShowDisplayHeader = shouldShowPostHeader || shouldUseOriginalPost;
  const shouldShowCompactBlur = !showFullContent && (displayPostDetails.is_blurred || previewPostDetails.is_blurred);

  const handleTagClick = () => {
    setTagsExpanded((previousValue) => !previousValue);
    // The tag button only reveals the tags. On mobile that reveal must not focus the input and pop
    // the soft keyboard: the `[+]` add control owns autofocus. The reveal still scrolls the panel
    // into view, from the effect below, once it has mounted.
    if (!isMobile) tagsPanelRef.current?.focus();
  };

  return (
    <CardContent className="flex min-w-0 flex-col gap-4 p-6">
      <Container overrideDefaults data-testid="post-main-list-row-header" className="flex min-w-0 items-center gap-3">
        {shouldShowDisplayHeader ? (
          <UserInfoPopover
            userId={displayUserId}
            userName={userDetails.name || ''}
            avatarUrl={avatarUrl}
            formattedPublicKey={formattedPublicKey}
          >
            <Link href={profileUrl} onClick={stopCardPropagation} className="shrink-0">
              <AvatarWithFallback
                avatarUrl={avatarUrl}
                name={userDetails.name || ''}
                fallbackSeed={displayUserId}
                size="md"
              />
            </Link>
          </UserInfoPopover>
        ) : null}

        <Container overrideDefaults className="min-w-0 flex-1">
          <Container overrideDefaults className="flex min-w-0 items-center gap-2">
            {shouldShowDisplayHeader ? (
              <Link
                href={profileUrl}
                onClick={stopCardPropagation}
                className={cn(showFullContent ? 'max-w-full' : 'max-w-[40%]', 'shrink-0')}
              >
                <Typography className="truncate text-base font-bold text-foreground" overrideDefaults>
                  {userDetails.name}
                </Typography>
              </Link>
            ) : null}
            {shouldShowCompactBlur ? (
              <PostContentBlurred
                postId={displayPostDetails.is_blurred ? displayPostId : previewPostId}
                variant="compact"
                className="min-w-0 flex-1"
              />
            ) : snippet ? (
              <Typography
                className={cn('min-w-0 flex-1 truncate text-secondary-foreground', LIST_POST_BODY_TEXT_CLASS)}
                overrideDefaults
              >
                {snippet}
              </Typography>
            ) : null}
          </Container>

          {shouldShowDisplayHeader ? (
            <Container overrideDefaults className="flex min-w-0 items-center gap-2">
              <Typography
                className="truncate text-xs font-medium tracking-[0.075rem] text-muted-foreground uppercase"
                overrideDefaults
              >
                {formattedPublicKey}
              </Typography>
              <PostHeaderTimestamp timeAgo={timeAgo} indexedAt={indexedAt} />
            </Container>
          ) : null}
        </Container>

        <Container
          overrideDefaults
          onClick={stopCardPropagation}
          onAuxClick={stopCardPropagation}
          className="flex shrink-0 items-center gap-3"
        >
          {!tagsExpanded ? (
            <ClickableTagsList
              taggedId={displayPostId}
              taggedKind={TagKind.POST}
              maxTags={1}
              showCount={true}
              showInput={false}
              showAddButton={false}
              addMode={true}
              className="hidden min-w-0 md:flex"
            />
          ) : null}
          <PostActionsBar
            postId={displayPostId}
            savePostId={savePostId}
            onTagClick={handleTagClick}
            onReplyClick={() => onReplyClick(displayPostId)}
            onRepostClick={() => onRepostClick(displayPostId)}
            className="shrink-0"
          />
        </Container>

        {!showFullContent && !shouldShowCompactBlur ? <PostListMediaThumbnail postId={previewPostId} /> : null}
      </Container>

      {showFullContent ? (
        <Container overrideDefaults className="min-w-0">
          <PostContent postId={postId} textClassName={LIST_POST_BODY_TEXT_CLASS} mediaVariant="list" />
        </Container>
      ) : null}

      {tagsExpanded ? (
        <Container overrideDefaults onClick={stopCardPropagation} onAuxClick={stopCardPropagation}>
          <PostTagsPanel
            ref={tagsPanelRef}
            postId={displayPostId}
            widthMode="fit"
            autoFocusInput={!isMobile}
            enableLoadingSkeleton={false}
          />
        </Container>
      ) : null}
    </CardContent>
  );
}
