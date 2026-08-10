'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { useInviteCodeSignUp } from '@/hooks/useInviteCodeSignUp/useInviteCodeSignUp';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { ButtonsNavigation } from '../ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '../Page/Page';

export const PublicKeyHeader = () => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {'Your unique '}
        <span className="text-brand">{'pubky.'}</span>
      </PageTitle>
      <PageSubtitle>{'Share your pubky with your friends so they can follow you.'}</PageSubtitle>
    </PageHeader>
  );
};

export const PublicKeyNavigation = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { validateAndSignUp } = useInviteCodeSignUp();

  const onHandleBackButton = () => {
    router.push(ONBOARDING_ROUTES.INSTALL);
  };

  const onHandleContinueButton = async () => {
    setLoading(true);
    try {
      // Signup happens here after the user has created their browser keypair.
      // The invite code was saved in the onboarding store during the human verification step.
      const inviteCode = useOnboardingStore.getState().inviteCode;
      await validateAndSignUp(inviteCode);
      router.push(ONBOARDING_ROUTES.BACKUP);
    } catch {
      setLoading(false);
    }
  };

  return (
    <ButtonsNavigation
      id="public-key-navigation"
      onHandleBackButton={onHandleBackButton}
      onHandleContinueButton={onHandleContinueButton}
      loadingContinueButton={loading}
    />
  );
};
