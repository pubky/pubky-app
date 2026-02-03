'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';
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

  const onHandleBackButton = () => {
    router.push(App.ONBOARDING_ROUTES.INSTALL);
  };

  const onHandleContinueButton = () => {
    setLoading(true);
    // Signup already happened at invite code entry; just navigate to backup
    router.push(App.ONBOARDING_ROUTES.BACKUP);
  };

  return (
    <Molecules.ButtonsNavigation
      id="public-key-navigation"
      className="py-4 pt-6"
      onHandleBackButton={onHandleBackButton}
      onHandleContinueButton={onHandleContinueButton}
      loadingContinueButton={loading}
    />
  );
};
