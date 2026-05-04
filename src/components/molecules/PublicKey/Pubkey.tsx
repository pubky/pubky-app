'use client';

import { useInviteCodeSignUp } from '@/hooks/useInviteCodeSignUp/useInviteCodeSignUp';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ButtonsNavigation } from '../ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '../Page/Page';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';

import { ONBOARDING_ROUTES } from '@/app/routes';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
export const PublicKeyHeader = () => {
  const t = useTranslations('onboarding.pubky');
  return (
    <PageHeader>
      <PageTitle size="large">
        {t.rich('uniqueTitle', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </PageTitle>
      <PageSubtitle>{t('uniqueSubtitle')}</PageSubtitle>
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
