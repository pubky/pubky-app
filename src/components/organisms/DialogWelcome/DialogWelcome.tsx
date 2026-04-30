'use client';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import { Key, ArrowRight } from 'lucide-react';
import { Logger } from '@/libs/logger/logger';
import { formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
/**
 * DialogWelcome
 *
 * Self-contained welcome dialog that manages its own state and data.
 * No props needed - it fetches user data and manages dialog state internally.
 */
export function DialogWelcome() {
  const { currentUserPubky } = useAuthStore();
  const { showWelcomeDialog, setShowWelcomeDialog } = useOnboardingStore();

  // Fetch current user details from database
  const userDetails = useLiveQuery(async () => {
    try {
      if (!currentUserPubky) return null;
      const details = await UserController.getDetails({
        userId: currentUserPubky,
      });
      return details || null;
    } catch (error) {
      Logger.error('[DialogWelcome] Failed to query user details', {
        error,
      });
      return null;
    }
  }, [currentUserPubky]);
  const { copyToClipboard } = useCopyToClipboard();

  // Don't render if conditions aren't met
  if (!userDetails || !currentUserPubky) {
    return null;
  }
  const displayPublicKey = formatPublicKey({
    key: currentUserPubky,
  });
  const avatarImage = userDetails.image
    ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
    : undefined;
  const handleCopyToClipboard = () => {
    copyToClipboard(withPubkyPrefix(currentUserPubky));
  };
  const handleExplorePubky = () => {
    // Set welcome dialog to false permanently - it will never show again for this user
    setShowWelcomeDialog(false);
  };
  return (
    <Atoms.Dialog open={showWelcomeDialog} onOpenChange={setShowWelcomeDialog}>
      <Atoms.DialogContent className="sm:max-w-2xl" hiddenTitle="Welcome to Pubky!">
        <Atoms.DialogHeader className="mb-3 gap-0 pr-6 text-left">
          <Atoms.DialogTitle id="welcome-title">Welcome to Pubky!</Atoms.DialogTitle>
          <Atoms.DialogDescription className="font-medium">
            Your keys, your content, your rules.
          </Atoms.DialogDescription>
        </Atoms.DialogHeader>
        <Atoms.Container className="max-h-[420px] overflow-y-auto">
          <Atoms.Container className="flex flex-col gap-4">
            <Atoms.Card className="flex flex-col items-center justify-center gap-4 self-stretch overflow-hidden rounded-lg bg-card p-6 sm:flex-row sm:items-start sm:justify-start">
              <Organisms.AvatarWithFallback
                avatarUrl={avatarImage}
                name={userDetails.name}
                fallbackSeed={currentUserPubky}
                className="h-24 w-24"
                fallbackClassName="text-4xl"
              />
              <Atoms.Container className="flex w-full min-w-0 flex-col items-center justify-center sm:items-start sm:justify-start">
                <Atoms.Typography size="lg" className="w-full truncate">
                  {userDetails.name}
                </Atoms.Typography>
                <Atoms.Typography
                  size="sm"
                  className="w-full truncate text-center font-medium text-muted-foreground sm:text-left"
                >
                  {userDetails.bio}
                </Atoms.Typography>
                <Atoms.Button
                  variant="secondary"
                  className="mt-2 h-8 w-fit gap-2 rounded-full uppercase"
                  onClick={handleCopyToClipboard}
                >
                  <Key className="h-4 w-4" />
                  {displayPublicKey || '...'}
                </Atoms.Button>
              </Atoms.Container>
            </Atoms.Card>
            <Atoms.Button id="welcome-explore-pubky-btn" className="w-auto" size="lg" onClick={handleExplorePubky}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Explore Pubky
            </Atoms.Button>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
