'use client';

import { ArrowLeft, FileQuestion, Tag, UserRound } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { ProfilePageEmptyState } from '../ProfilePageEmptyState/ProfilePageEmptyState';

interface PostNotFoundProps {
  title: string;
  subtitle: string;
  imageAlt: string;
  backToFeedLabel: string;
  viewProfileLabel: string;
  exploreTagsLabel: string;
  onBackToFeed: () => void;
  /** When omitted (e.g. malformed post URL), the View profile action is hidden */
  onViewProfile?: () => void;
  onExploreTags: () => void;
}

/**
 * Empty state when a post URL does not resolve to a post (cache miss after fetch).
 * Copy and navigation are supplied by the parent (e.g. `next-intl` + `useRouter`).
 */
export function PostNotFound({
  title,
  subtitle,
  imageAlt,
  backToFeedLabel,
  viewProfileLabel,
  exploreTagsLabel,
  onBackToFeed,
  onViewProfile,
  onExploreTags,
}: PostNotFoundProps) {
  return (
    <ProfilePageEmptyState
      imageSrc="/images/connections-empty-state.webp"
      imageAlt={imageAlt}
      icon={FileQuestion}
      title={title}
      subtitle={subtitle}
    >
      <Container overrideDefaults className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row">
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={onBackToFeed}>
          <ArrowLeft className="size-4 shrink-0" />
          {backToFeedLabel}
        </Button>
        {onViewProfile ? (
          <Button type="button" variant={ButtonVariant.SECONDARY} onClick={onViewProfile}>
            <UserRound className="size-4 shrink-0" />
            {viewProfileLabel}
          </Button>
        ) : null}
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={onExploreTags}>
          <Tag className="size-4 shrink-0" />
          {exploreTagsLabel}
        </Button>
      </Container>
    </ProfilePageEmptyState>
  );
}
