'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, UserRoundPlus } from 'lucide-react';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useFollowAll } from '@/hooks/useFollowAll/useFollowAll';
import { useStarterPackSuggestions } from '@/hooks/useStarterPackSuggestions/useStarterPackSuggestions';
import { ProfileNavigation } from '@/molecules/ProfileNavigation/ProfileNavigation';
import { SuggestedUserCard } from '@/organisms/SuggestedUserCard/SuggestedUserCard';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH } from '@/stores/home/home.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { SuggestedUsersGridSkeleton } from './FollowBestMatchesForm.skeleton';

export const FollowBestMatchesForm = () => {
  const router = useRouter();
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const markExperienceCompleted = useOnboardingStore((state) => state.markExperienceCompleted);

  const {
    users,
    unfollowedUsers,
    followedCount,
    isLoading,
    error,
    handleFollowClick,
    isUserLoading,
    isFollowPending,
    preserveFollowedUser,
  } = useStarterPackSuggestions();
  const { followAll, isRunning: isFollowingAll, progress } = useFollowAll({ onFollowed: preserveFollowedUser });

  const showFollowAll = !isLoading && (unfollowedUsers.length > 0 || isFollowingAll);
  // Finish decides the landing feed from `followedCount`, which is derived from the relationships
  // live query and only updates once a follow's local write lands. Lock navigation while any
  // follow (single card or Follow all) is in flight so Finish never reads a stale count.
  const isNavigationLocked = isFollowingAll || isFollowPending;

  const handleFollowAll = () => {
    void followAll(unfollowedUsers.map(({ id, isFollowing }) => ({ id, isFollowing })));
  };

  const handleFinish = () => {
    // This screen owns Experience completion: written here (not on Tags Continue) so Back
    // from this screen never trips the re-prompt guard on the tags step.
    if (pubky) {
      markExperienceCompleted(pubky);
    }
    // Landing feed per flow spec: My network with at least one follow, otherwise stay on All
    // (an empty My network feed is a dead end). The explicit set flips `hasUserSetReach`, which
    // intentionally suppresses the >= 3 follows soft default from `useDefaultHomeReach`; with
    // zero follows we leave the store untouched so that default can still kick in later.
    if (followedCount >= 1) {
      useHomeStore.getState().setReach(REACH.NETWORK);
    }
    router.replace(APP_ROUTES.HOME);
  };

  const handleBack = () => {
    router.push(ONBOARDING_ROUTES.TAGS);
  };

  return (
    <Container
      className="flex w-full flex-1 flex-col gap-6 lg:flex-none"
      data-testid="follow-best-matches-form"
      data-cy="follow-best-matches-form"
    >
      <Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
        {/* Illustration Section: top-aligned so it stays put as the suggestions grid grows */}
        <Container className="hidden w-full items-center justify-start lg:flex lg:max-w-64">
          <Image
            src="/images/best-matches.webp"
            alt="Follow your best matches"
            width={192}
            height={192}
            className="size-48"
            priority
          />
        </Container>

        {/* Suggested People Section */}
        <Container className="w-full gap-6">
          <Container overrideDefaults className="flex flex-wrap items-center justify-between gap-3">
            <Heading level={3} size="xl" className="text-2xl">
              {'Suggested people'}
            </Heading>
            {showFollowAll && (
              <Button
                variant="brand"
                size="sm"
                onClick={handleFollowAll}
                disabled={isFollowingAll}
                data-cy="follow-all-btn"
                data-testid="follow-all-btn"
              >
                {isFollowingAll ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {`Following ${progress.completed}/${progress.total}`}
                  </>
                ) : (
                  <>
                    <UserRoundPlus className="size-4" />
                    {`Follow all (${unfollowedUsers.length})`}
                  </>
                )}
              </Button>
            )}
          </Container>

          {isLoading ? (
            <SuggestedUsersGridSkeleton />
          ) : users.length === 0 ? (
            <Typography size="sm" className="font-normal text-muted-foreground" data-testid="suggested-people-empty">
              {error
                ? 'Suggestions are unavailable right now. You can still finish and explore.'
                : 'No suggestions yet. You can still finish and explore.'}
            </Typography>
          ) : (
            <Container overrideDefaults className="grid gap-3 md:grid-cols-2" data-testid="suggested-people-grid">
              {users.map((user) => (
                <SuggestedUserCard
                  key={user.id}
                  user={user}
                  isLoading={isFollowingAll || isUserLoading(user.id)}
                  onFollowClick={handleFollowClick}
                />
              ))}
            </Container>
          )}
        </Container>
      </Card>

      <ProfileNavigation
        className="onboarding-nav mt-auto flex-col sm:flex-row lg:pt-0"
        backText={'Back'}
        onHandleBackButton={handleBack}
        backButtonDisabled={isNavigationLocked}
        continueButtonDisabled={isNavigationLocked}
        continueText={'Finish'}
        onContinue={handleFinish}
      />
    </Container>
  );
};
