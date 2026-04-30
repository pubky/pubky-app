'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';

/**
 * AlertBackup
 *
 * Self-contained component that manages its own visibility state.
 * Shows an alert when user has a secret key that needs to be backed up.
 * No props needed - manages its own state internally.
 */
import { TriangleAlert } from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
export const AlertBackup = () => {
  const { secretKey } = useOnboardingStore();
  const [showAlert, setShowAlert] = useState(false);
  const t = useTranslations('settings.backup');
  useEffect(() => {
    if (secretKey) {
      setShowAlert(true);
    }
  }, [secretKey]);
  const handleDismiss = () => {
    setShowAlert(false);
  };

  // Don't show alert if there's no secretKey or it was dismissed
  if (!secretKey || !showAlert) {
    return null;
  }
  return (
    <Atoms.Container className="flex-row items-center gap-3 rounded-lg bg-brand px-6 py-3">
      <Atoms.Container className="flex-1 flex-row items-center gap-3">
        <TriangleAlert className="h-4 w-4 font-bold text-primary-foreground" />
        <Atoms.Typography size="sm" className="font-bold whitespace-nowrap text-primary-foreground">
          <span className="md:hidden">{t('alertShort')}</span>
          <span className="hidden md:inline">{t('alertFull')}</span>
        </Atoms.Typography>
      </Atoms.Container>
      <Organisms.DialogBackup />
      <Organisms.DialogConfirmBackup onConfirm={handleDismiss} />
    </Atoms.Container>
  );
};
