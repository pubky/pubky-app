'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogBackup } from '../DialogBackup/DialogBackup';
import { DialogConfirmBackup } from '../DialogConfirmBackup/DialogConfirmBackup';

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
    <Container className="flex-row items-center gap-3 rounded-lg bg-brand px-6 py-3">
      <Container className="flex-1 flex-row items-center gap-3">
        <TriangleAlert className="h-4 w-4 font-bold text-primary-foreground" />
        <Typography size="sm" className="font-bold whitespace-nowrap text-primary-foreground">
          <span className="md:hidden">{t('alertShort')}</span>
          <span className="hidden md:inline">{t('alertFull')}</span>
        </Typography>
      </Container>
      <DialogBackup />
      <DialogConfirmBackup onConfirm={handleDismiss} />
    </Container>
  );
};
