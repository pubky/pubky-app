'use client';

import { useInviteCodeSignUp } from '@/hooks/useInviteCodeSignUp/useInviteCodeSignUp';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as App from '@/app';

export const PublicKeyHeader = () => {
  const t = useTranslations('onboarding.pubky');
  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        {t.rich('uniqueTitle', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </Molecules.PageTitle>
      <Atoms.PageSubtitle>{t('uniqueSubtitle')}</Atoms.PageSubtitle>
    </Atoms.PageHeader>
  );
};

export const PublicKeyNavigation = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { validateAndSignUp } = useInviteCodeSignUp();

  const onHandleBackButton = () => {
    router.push(App.ONBOARDING_ROUTES.INSTALL);
  };

  const onHandleContinueButton = async () => {
    setLoading(true);
    try {
      // Signup happens here after the user has created their browser keypair.
      // The invite code was saved in the onboarding store during the human verification step.
      const inviteCode = Core.useOnboardingStore.getState().inviteCode;
      await validateAndSignUp(inviteCode);
      router.push(App.ONBOARDING_ROUTES.BACKUP);
    } catch {
      setLoading(false);
    }
  };

  return (
    <Molecules.ButtonsNavigation
      id="public-key-navigation"
      onHandleBackButton={onHandleBackButton}
      onHandleContinueButton={onHandleContinueButton}
      loadingContinueButton={loading}
    />
  );
};
