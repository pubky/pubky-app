'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as App from '@/app';

export const BackupNavigation = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onHandleContinueButton = () => {
    setLoading(true);
    // Signup already happened at the invite code step; just navigate to profile
    router.push(App.ONBOARDING_ROUTES.PROFILE);
  };

  const onHandleBackButton = () => {
    router.push(App.ONBOARDING_ROUTES.PUBKY);
  };

  return (
    <Molecules.ButtonsNavigation
      id="backup-navigation"
      className="py-6"
      onHandleBackButton={onHandleBackButton}
      loadingContinueButton={loading}
      onHandleContinueButton={onHandleContinueButton}
    />
  );
};

export const BackupPageHeader = () => {
  const t = useTranslations('onboarding.backup');
  return (
    <Atoms.PageHeader data-testid="backup-page-header">
      <Molecules.PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </Molecules.PageTitle>
      <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
    </Atoms.PageHeader>
  );
};
