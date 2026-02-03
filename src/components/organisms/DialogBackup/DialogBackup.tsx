'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import Image from 'next/image';
import * as Organisms from '@/organisms';

interface DialogBackupProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface BackupMethodCardProps {
  title: React.ReactNode;
  imageSrc: string;
  imageAlt: string;
  dialog: React.ReactNode;
}

function BackupMethodCard({ title, imageSrc, imageAlt, dialog }: BackupMethodCardProps) {
  return (
    <Atoms.Card className="w-full flex-[1_0_0] flex-col gap-3 rounded-md px-0 py-0 md:gap-6">
      {/* Card Header */}
      <div className="flex flex-col gap-2 px-6 py-0 pt-5 md:pt-6">
        <Atoms.Typography size="md" className="text-base leading-none font-bold text-card-foreground">
          {title}
        </Atoms.Typography>
      </div>

      {/* Card Content */}
      <div className="flex flex-col gap-2 px-24 py-0 md:px-6">
        <div className="flex aspect-square w-full items-center justify-center">
          <Image src={imageSrc} alt={imageAlt} width={192} height={192} className="h-full w-full object-cover" />
        </div>
      </div>

      {/* Card Footer */}
      <div className="flex flex-col gap-2 px-6 py-0 pb-5 md:pb-6">{dialog}</div>
    </Atoms.Card>
  );
}

export function DialogBackup({ open, onOpenChange }: DialogBackupProps = {}) {
  const { mnemonic } = Core.useOnboardingStore();
  const t = useTranslations('settings.backup');

  return (
    <Atoms.Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <Atoms.DialogTrigger asChild>
          <Atoms.Button
            id="backup-btn"
            variant="outline"
            className="border text-xs font-bold text-primary-foreground shadow-sm hover:text-primary-foreground"
          >
            {t('title')}
          </Atoms.Button>
        </Atoms.DialogTrigger>
      )}
      <Atoms.DialogContent className="max-w-sm p-6 md:max-w-xl md:p-8" hiddenTitle={t('dialogTitle')}>
        <Atoms.DialogHeader>
          <Atoms.DialogTitle id="backup-dialog-title" className="text-xl md:text-2xl">
            {t('dialogTitle')}
          </Atoms.DialogTitle>
          <Atoms.DialogDescription id="backup-dialog-description">{t('subtitle')}</Atoms.DialogDescription>
        </Atoms.DialogHeader>
        <Atoms.Container className="flex-col gap-3 md:flex-row">
          <BackupMethodCard
            title={t('recoveryPhrase')}
            imageSrc="/images/note.webp"
            imageAlt={t('note')}
            dialog={<Organisms.DialogBackupPhrase />}
          />
          <BackupMethodCard
            title={t('encryptedFile')}
            imageSrc="/images/folder.webp"
            imageAlt={t('folder')}
            dialog={<Organisms.DialogBackupEncrypted />}
          />
          <BackupMethodCard
            title={t('exportRing')}
            imageSrc="/images/keyring.webp"
            imageAlt={t('keys')}
            dialog={<Organisms.DialogBackupExport mnemonic={mnemonic} />}
          />
        </Atoms.Container>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
