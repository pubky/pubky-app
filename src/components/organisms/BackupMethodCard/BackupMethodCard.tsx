'use client';

import { FileDown, FileText, Scan } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { ContentCard } from '@/molecules/Content/Content';
import { PopoverBackup } from '@/molecules/PopoverBackup/PopoverBackup';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { DialogBackupEncrypted } from '../DialogBackupEncrypted/DialogBackupEncrypted';
import { DialogBackupExport } from '../DialogBackupExport/DialogBackupExport';
import { DialogBackupPhrase } from '../DialogBackupPhrase/DialogBackupPhrase';

export const BackupMethodCard = () => {
  const t = useTranslations('onboarding.backupMethod');
  const mnemonic = useOnboardingStore((state) => state.mnemonic);

  return (
    <ContentCard
      className="rounded-md"
      image={{
        src: '/images/shield.webp',
        alt: 'Shield',
        width: 192,
        height: 192,
      }}
    >
      <Container className="flex-row items-center gap-2">
        <Heading level={2} size="md" className="font-bold">
          {t('title')}
        </Heading>
        <PopoverBackup />
      </Container>
      <Container className="mx-0 max-w-[576px]">
        <Typography size="sm" className="text-base font-medium text-secondary-foreground opacity-80">
          {t('subtitle')}
        </Typography>
        <Container className="mt-6 flex-col gap-3 lg:flex-row lg:flex-wrap">
          <DialogBackupPhrase>
            <Button id="backup-recovery-phrase-btn" variant="secondary" className="w-full gap-2 font-bold lg:w-auto">
              <FileText className="h-4 w-4" />
              <span>{t('recoveryPhrase')}</span>
            </Button>
          </DialogBackupPhrase>
          <DialogBackupEncrypted>
            <Button id="backup-encrypted-file-btn" variant="secondary" className="w-full gap-2 font-bold lg:w-auto">
              <FileDown className="h-4 w-4" />
              <span>{t('encryptedFile')}</span>
            </Button>
          </DialogBackupEncrypted>
          <DialogBackupExport mnemonic={mnemonic}>
            <Button id="backup-pubky-ring-btn" className="w-full gap-2 font-bold lg:w-auto">
              <Scan className="h-4 w-4" />
              <span>{t('exportRing')}</span>
            </Button>
          </DialogBackupExport>
        </Container>
      </Container>
    </ContentCard>
  );
};
