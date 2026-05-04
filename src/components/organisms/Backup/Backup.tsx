'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '@/molecules/Page/Page';

import { ONBOARDING_ROUTES } from '@/app/routes';

export const BackupNavigation = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onHandleContinueButton = () => {
    setLoading(true);
    // Signup already happened at the pubky step; just navigate to profile
    router.push(ONBOARDING_ROUTES.PROFILE);
  };

  return (
    <ButtonsNavigation
      id="backup-navigation"
      loadingContinueButton={loading}
      onHandleContinueButton={onHandleContinueButton}
      continueButtonClassName="w-full md:flex-0"
      backButtonDisabled={true}
    />
  );
};

export const BackupPageHeader = () => {
  const t = useTranslations('onboarding.backup');
  return (
    <PageHeader data-testid="backup-page-header">
      <PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </PageTitle>
      <PageSubtitle>{t('subtitle')}</PageSubtitle>
    </PageHeader>
  );
};
