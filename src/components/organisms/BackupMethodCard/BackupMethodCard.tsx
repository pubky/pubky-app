'use client';

import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';

export const BackupMethodCard = () => {
  const t = useTranslations('onboarding.backupMethod');
  //const { mnemonic } = Stores.useOnboardingStore();
  return (
    <Molecules.ContentCard
      image={{
        src: '/images/shield.webp',
        alt: 'Shield',
        width: 192,
        height: 192,
      }}
    >
      <Atoms.Container className="flex-row items-center gap-1">
        <Atoms.Heading level={2} size="lg">
          {t('title')}
        </Atoms.Heading>
        <Molecules.PopoverBackup />
      </Atoms.Container>
      <Atoms.Container className="mx-0 max-w-[576px]">
        <Atoms.Typography size="sm" className="text-base font-medium text-secondary-foreground opacity-80">
          {t('subtitle')}
        </Atoms.Typography>
        <Atoms.Container className="mt-6 flex-row flex-wrap gap-3">
          <Organisms.DialogBackupPhrase>
            <Atoms.Button id="backup-recovery-phrase-btn" variant="secondary" className="gap-2">
              <Libs.FileText className="h-4 w-4" />
              <span>{t('recoveryPhrase')}</span>
            </Atoms.Button>
          </Organisms.DialogBackupPhrase>
          <Organisms.DialogBackupEncrypted>
            <Atoms.Button id="backup-encrypted-file-btn" variant="secondary" className="gap-2">
              <Libs.FileText className="h-4 w-4" />
              <span>{t('encryptedFile')}</span>
            </Atoms.Button>
          </Organisms.DialogBackupEncrypted>
          {/* TODO: Re-enable when Pubky Ring export is ready
          <Organisms.DialogBackupExport mnemonic={mnemonic}>
            <Atoms.Button className="gap-2" disabled>
              <Libs.Scan className="h-4 w-4" />
              <span>{mnemonic ? 'Export recovery phrase' : 'Export to Pubky Ring'}</span>
            </Atoms.Button>
          </Organisms.DialogBackupExport>
          */}
        </Atoms.Container>
      </Atoms.Container>
    </Molecules.ContentCard>
  );
};
