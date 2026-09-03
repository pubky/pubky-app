'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { STARTER_PACK_MAX_TAGS, STARTER_PACK_RESERVED_TAGS } from '@/config/nexus';
import { ONBOARDING_INTERESTS_SUGGESTED_COUNT } from '@/config/tags';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useInterestTags } from '@/hooks/useInterestTags/useInterestTags';
import { canonicalizeTagLabel, isStarterPackReservedTag } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { ProfileNavigation } from '@/molecules/ProfileNavigation/ProfileNavigation';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { PopularInterestTagsSkeleton } from './TagsOfInterestForm.skeleton';

export const TagsOfInterestForm = () => {
  const router = useRouter();
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const setInterestTags = useOnboardingStore((state) => state.setInterestTags);
  const markExperienceCompleted = useOnboardingStore((state) => state.markExperienceCompleted);

  const { tags: fetchedPopularTags, isLoading: arePopularTagsLoading } = useHotTags({
    limit: ONBOARDING_INTERESTS_SUGGESTED_COUNT,
  });
  const popularTags = fetchedPopularTags.filter((tag) => !isStarterPackReservedTag(tag.name));
  // Seed from the persisted selection (frozen at mount) so a round trip to the profile
  // step — Back button or browser back — restores the tags and their order.
  const [initialTags] = useState(() => useOnboardingStore.getState().interestTags);
  const { selectedTags, addTag, removeTag, toggleTag, isSelected, isAtLimit } = useInterestTags(initialTags);

  // Persist every change rather than only on Continue: Back, browser back, and guard
  // redirects all bypass the Continue handler and must not lose the selection.
  useEffect(() => {
    setInterestTags(selectedTags);
  }, [selectedTags, setInterestTags]);

  const popularLabels = new Set(popularTags.map((tag) => canonicalizeTagLabel(tag.name)));
  const selectedPopularCount = selectedTags.filter((tag) => popularLabels.has(tag)).length;
  const customTags = arePopularTagsLoading ? [] : selectedTags.filter((tag) => !popularLabels.has(tag));

  const handleContinue = () => {
    // Selection is already persisted by the sync effect above.
    // TEMPORARY(#2388): Tags is currently the last Experience screen, so completion is
    // written here. #2388 relocates this write to the Follow screen's Finish action and
    // retargets Continue to the follow route.
    if (pubky) {
      markExperienceCompleted(pubky);
    }
    router.replace(APP_ROUTES.HOME);
  };

  const handleBack = () => {
    router.push(ONBOARDING_ROUTES.PROFILE);
  };

  return (
    <Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none" data-testid="tags-of-interest-form">
      <Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
        {/* Illustration Section */}
        <Container className="hidden w-full items-center justify-center lg:flex lg:max-w-64">
          <Image src="/images/tag.webp" alt="Tags of interest" width={192} height={192} className="size-48" priority />
        </Container>

        {/* Popular Interests Section */}
        <Container className="w-full gap-6">
          <Container className="gap-3">
            <Heading level={3} size="xl" className="text-2xl">
              {'Popular interests'}
              {!arePopularTagsLoading && (
                <span className="font-normal text-muted-foreground">{` (${selectedPopularCount} selected)`}</span>
              )}
            </Heading>
            <Typography size="sm" className="font-normal text-muted-foreground">
              {'Select which topics you find interesting.'}
            </Typography>
          </Container>
          {arePopularTagsLoading ? (
            <PopularInterestTagsSkeleton />
          ) : popularTags.length === 0 ? (
            <Typography size="sm" className="font-normal text-muted-foreground" data-testid="popular-interests-empty">
              {'Popular interests are unavailable. You can still add your own.'}
            </Typography>
          ) : (
            <Container overrideDefaults className="flex flex-row flex-wrap content-start gap-2">
              {popularTags.map((tag) => {
                const selected = isSelected(tag.name);
                return (
                  <PostTag
                    key={tag.name}
                    label={tag.name}
                    selected={selected}
                    // At the cap only unselected chips lock; selected chips stay interactive for deselection
                    disabled={isAtLimit && !selected}
                    onClick={() => toggleTag(tag.name)}
                    data-testid={`popular-tag-${canonicalizeTagLabel(tag.name)}`}
                  />
                );
              })}
            </Container>
          )}
        </Container>

        {/* Your Interests Section */}
        <Container className="mt-6 w-full gap-6 lg:mt-0 lg:max-w-72">
          <Container className="gap-3">
            <Heading level={3} size="xl" className="text-2xl">
              {'Your interests'}
            </Heading>
            <Typography size="sm" className="font-normal text-muted-foreground">
              {'Add other topics you like.'}
            </Typography>
          </Container>
          <Container overrideDefaults className="flex flex-col gap-3">
            <TagInput
              onTagAdd={addTag}
              placeholder={'add tag'}
              viewerTags={selectedTags.map((label) => ({ label }))}
              maxTags={STARTER_PACK_MAX_TAGS}
              currentTagsCount={selectedTags.length}
              limitReachedPlaceholder={`${STARTER_PACK_MAX_TAGS} tags max`}
              clearOnLimitReached
              showEmojiButton={!isAtLimit}
              enableApiSuggestions
              excludeFromApiSuggestions={[...selectedTags, ...STARTER_PACK_RESERVED_TAGS]}
              addOnSuggestionClick
              containerVariant="dashed"
            />
            {customTags.length > 0 && (
              <Container overrideDefaults className="flex flex-row flex-wrap content-start gap-2">
                {customTags.map((tag) => (
                  <PostTag
                    key={tag}
                    label={tag}
                    selected
                    showClose
                    onClose={() => removeTag(tag)}
                    onClick={() => removeTag(tag)}
                    data-testid={`interest-tag-${tag}`}
                  />
                ))}
              </Container>
            )}
          </Container>
        </Container>
      </Card>

      <ProfileNavigation
        className="onboarding-nav mt-auto flex-col sm:flex-row lg:pt-0"
        backText={'Back'}
        onHandleBackButton={handleBack}
        continueButtonDisabled={false}
        continueText={'Continue'}
        onContinue={handleContinue}
      />
    </Container>
  );
};
