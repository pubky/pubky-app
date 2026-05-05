'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { ContentCard } from '@/molecules/Content/Content';
import { PopoverBackup } from '@/molecules/PopoverBackup/PopoverBackup';
import { DialogBackupEncrypted } from '../DialogBackupEncrypted/DialogBackupEncrypted';
import { DialogBackupPhrase } from '../DialogBackupPhrase/DialogBackupPhrase';

export const BackupMethodCard = () => {
  const t = useTranslations('onboarding.backupMethod');
  //const { mnemonic } = Stores.useOnboardingStore();
  return (
    <ContentCard
      image={{
        src: '/images/shield.webp',
        alt: 'Shield',
        width: 192,
        height: 192,
      }}
    >
      <Container className="flex-row items-center gap-1">
        <Heading level={2} size="lg">
          {t('title')}
        </Heading>
        <PopoverBackup />
      </Container>
      <Container className="mx-0 max-w-[576px]">
        <Typography size="sm" className="text-base font-medium text-secondary-foreground opacity-80">
          {t('subtitle')}
        </Typography>
        <Container className="mt-6 flex-row flex-wrap gap-3">
          <DialogBackupPhrase>
            <Button id="backup-recovery-phrase-btn" variant="secondary" className="gap-2">
              <FileText className="h-4 w-4" />
              <span>{t('recoveryPhrase')}</span>
            </Button>
          </DialogBackupPhrase>
          <DialogBackupEncrypted>
            <Button id="backup-encrypted-file-btn" variant="secondary" className="gap-2">
              <FileText className="h-4 w-4" />
              <span>{t('encryptedFile')}</span>
            </Button>
          </DialogBackupEncrypted>
          {/* TODO: Re-enable when Pubky Ring export is ready
           <Organisms.DialogBackupExport mnemonic={mnemonic}>
            <Atoms.Button className="gap-2" disabled>
              <FileText className="h-4 w-4" />
              <span>{mnemonic ? 'Export recovery phrase' : 'Export to Pubky Ring'}</span>
            </Atoms.Button>
           </Organisms.DialogBackupExport>
           */}
        </Container>
      </Container>
    </ContentCard>
  );
};
