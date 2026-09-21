'use client';

import { useRouter } from 'next/navigation';
import { Tag } from 'lucide-react';
import { getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { TaggedItem } from '../TaggedItem/TaggedItem';
import { TagInput } from '../TagInput/TagInput';
import { ProfilePageTaggedAsSkeleton } from './ProfilePageTaggedAs.skeleton';
import type { ProfilePageTaggedAsProps } from './ProfilePageTaggedAs.types';

export function ProfilePageTaggedAs({
  tags,
  isLoading = false,
  onTagClick,
  pubky,
  variant = 'sidebar',
  count = 0,
  onTagAdd,
  allTags,
}: ProfilePageTaggedAsProps) {
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const isMobile = variant === 'mobile';
  const inputTags = allTags ?? tags;

  // Sidebar keeps the previous behaviour: the action that navigates to the
  // tagged list is gated behind auth because it is the entry point to tagging.
  const handleAddTagClick = () => {
    requireAuth(() => router.push(getProfileRoute(PROFILE_ROUTES.UNIQUE_TAGS, pubky)));
  };

  // Mobile "See All" is a read-only navigation, so it is not auth-gated.
  const handleSeeAllClick = () => {
    router.push(getProfileRoute(PROFILE_ROUTES.UNIQUE_TAGS, pubky));
  };

  return (
    <Container data-cy="profile-tagged-section" overrideDefaults={true} className="flex flex-col gap-2">
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        {isMobile ? `Tagged (${count})` : 'Tagged as'}
      </Heading>

      <Container overrideDefaults={true} className="flex flex-col gap-2">
        {isLoading ? (
          <ProfilePageTaggedAsSkeleton />
        ) : (
          <>
            {isMobile && onTagAdd && (
              <TagInput
                onTagAdd={onTagAdd}
                existingTags={inputTags}
                showEmojiButton={false}
                enableApiSuggestions
                excludeFromApiSuggestions={inputTags.map((tag) => tag.label)}
                addOnSuggestionClick
              />
            )}
            {tags.map((tag) => (
              <TaggedItem key={tag.label} tag={tag} onTagClick={onTagClick} hideAvatars={!isMobile} />
            ))}
            {tags.length === 0 && (
              <Typography as="span" className="text-sm font-medium text-muted-foreground">
                {'No tags added yet.'}
              </Typography>
            )}
          </>
        )}
      </Container>

      <Button
        data-cy="profile-tag-btn"
        variant="outline"
        size="sm"
        className="border border-border bg-foreground/5"
        onClick={isMobile ? handleSeeAllClick : handleAddTagClick}
      >
        <Tag size={16} className="text-foreground" />
        <Typography as="span" className="text-sm font-bold">
          {isMobile ? 'See All' : 'Add Tag'}
        </Typography>
      </Button>
    </Container>
  );
}
