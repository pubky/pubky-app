'use client';

import React, { useRef, useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import { PostListMediaThumbnail } from '@/molecules/PostListMediaThumbnail/PostListMediaThumbnail';
import { truncateAtWordBoundary } from '@/molecules/PostText/PostText.utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';
import { PostMainListRowSkeleton } from './PostMainListRow.skeleton';
import { LIST_POST_BODY_TEXT_CLASS, LIST_POST_MEDIA_THUMBNAIL_CLASS } from './PostMainTypography';

const LIST_SNIPPET_MAX_CHARS = 120;

const stopCardPropagation = (event: React.MouseEvent) => event.stopPropagation();

function getListPostSnippet(content: string, kind: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }

  if (kind === 'long') {
    try {
      const parsed = JSON.parse(trimmed) as { title?: string; body?: string };
      return parsed.title?.trim() || parsed.body?.trim() || '';
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

interface PostMainListRowProps {
  postId: string;
  shouldShowPostHeader: boolean;
  onReplyClick: () => void;
  onRepostClick: () => void;
}

export function PostMainListRow({ postId, shouldShowPostHeader, onReplyClick, onRepostClick }: PostMainListRowProps) {
  const userId = postId.split(':')[0];
  const { postDetails } = usePostDetails(postId);
  const { userDetails } = useUserDetails(userId);
  const avatarUrl = useAvatarUrl(userDetails);
  const { formatRelativeTime } = useRelativeTime();
  const tagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  if (!postDetails || !userDetails) {
    return <PostMainListRowSkeleton />;
  }

  const indexedAt = new Date(postDetails.indexed_at);
  const timeAgo = formatRelativeTime(indexedAt);
  const formattedPublicKey = formatPublicKey({ key: userId });
  const snippet = truncateAtWordBoundary(
    getListPostSnippet(postDetails.content, postDetails.kind),
    LIST_SNIPPET_MAX_CHARS,
  );
  const profileUrl = `/profile/${userId}`;

  const handleTagClick = () => {
    setTagsExpanded((previousValue) => !previousValue);
    tagsPanelRef.current?.focus();
  };

  return (
    <CardContent className="flex min-w-0 flex-col gap-4 p-6">
      <Container overrideDefaults className="flex min-w-0 items-center gap-6">
        {shouldShowPostHeader ? (
          <Link href={profileUrl} onClick={stopCardPropagation} className="shrink-0">
            <AvatarWithFallback avatarUrl={avatarUrl} name={userDetails.name || ''} fallbackSeed={userId} size="md" />
          </Link>
        ) : null}

        <Container overrideDefaults className="min-w-0 flex-1">
          <Container overrideDefaults className="flex min-w-0 items-center gap-2">
            {shouldShowPostHeader ? (
              <Link href={profileUrl} onClick={stopCardPropagation} className="max-w-[40%] shrink-0">
                <Typography className="truncate text-base font-bold text-foreground" overrideDefaults>
                  {userDetails.name}
                </Typography>
              </Link>
            ) : null}
            {snippet ? (
              <Typography
                className={cn('min-w-0 flex-1 truncate text-secondary-foreground', LIST_POST_BODY_TEXT_CLASS)}
                overrideDefaults
              >
                {snippet}
              </Typography>
            ) : null}
          </Container>

          {shouldShowPostHeader ? (
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
              taggedId={postId}
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
            postId={postId}
            onTagClick={handleTagClick}
            onReplyClick={onReplyClick}
            onRepostClick={onRepostClick}
            className="shrink-0"
          />
        </Container>

        <PostListMediaThumbnail
          postId={postId}
          className={cn('hidden rounded-sm md:block', LIST_POST_MEDIA_THUMBNAIL_CLASS)}
          onClick={stopCardPropagation}
        />
      </Container>

      {tagsExpanded ? (
        <Container overrideDefaults onClick={stopCardPropagation} onAuxClick={stopCardPropagation}>
          <PostTagsPanel
            ref={tagsPanelRef}
            postId={postId}
            widthMode="fit"
            autoFocusInput
            enableLoadingSkeleton={false}
          />
        </Container>
      ) : null}
    </CardContent>
  );
}
