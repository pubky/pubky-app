'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROOT_ROUTES } from '@/app/routes';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { AuthController } from '@/controllers/auth/auth';
import { formatInviteCode } from '@/libs/utils/utils';
import { InstallCard, InstallFooter, InstallHeader, InstallNavigation } from '@/molecules/Install/Install';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { toast } from '@/molecules/Toaster/toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export function Install() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasInitialisedFromUrlRef = useRef(false);
  const inviteCodeFromUrl = formatInviteCode(searchParams.get('inviteCode') ?? '');
  const hasInviteCodeFromUrl = inviteCodeFromUrl.length === 14;
  const [isVerifying, setIsVerifying] = useState(hasInviteCodeFromUrl);

  useEffect(() => {
    if (hasInitialisedFromUrlRef.current || !hasInviteCodeFromUrl) {
      return;
    }

    hasInitialisedFromUrlRef.current = true;

    (async () => {
      try {
        // Verify the invite code with the homeserver before applying it.
        const status = await AuthController.verifySignupToken(inviteCodeFromUrl);

        if (status === 'valid') {
          useOnboardingStore.getState().setInviteCode(inviteCodeFromUrl);
          toast({
            title: 'Invite code applied',
          });
          setIsVerifying(false);
          return;
        }

        if (status === 'used') {
          toast({
            variant: 'error',
            title: 'Invite code already used',
          });
        } else {
          toast({
            variant: 'error',
            title: 'Invalid invite code',
          });
        }
      } catch {
        // The homeserver could not be reached, so we couldn't confirm the code.
        toast({
          variant: 'error',
          title: "Couldn't verify invite code",
        });
      }

      // Keep the verifying state to avoid flashing the install page before the redirect.
      router.replace(ROOT_ROUTES);
    })();
  }, [hasInviteCodeFromUrl, inviteCodeFromUrl, router]);

  if (isVerifying) {
    return (
      <OnboardingLayout testId="install-content">
        <div className="flex w-full flex-1 items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout testId="install-content" navigation={<InstallNavigation />}>
      <InstallHeader />
      <InstallCard />
      <InstallFooter />
    </OnboardingLayout>
  );
}
