'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { DialogBackupEncrypted } from '../DialogBackupEncrypted/DialogBackupEncrypted';
import { DialogBackupExport } from '../DialogBackupExport/DialogBackupExport';
import { DialogBackupPhrase } from '../DialogBackupPhrase/DialogBackupPhrase';

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
    <Card className="w-full flex-[1_0_0] flex-col gap-3 rounded-md px-0 py-0 md:gap-6">
      {/* Card Header */}
      <div className="flex flex-col gap-2 px-6 py-0 pt-5 md:pt-6">
        <Typography size="md" className="text-base leading-none font-bold text-card-foreground">
          {title}
        </Typography>
      </div>

      {/* Card Content */}
      <div className="flex flex-col gap-2 px-24 py-0 md:px-6">
        <div className="flex aspect-square w-full items-center justify-center">
          <Image src={imageSrc} alt={imageAlt} width={192} height={192} className="h-full w-full object-cover" />
        </div>
      </div>

      {/* Card Footer */}
      <div className="flex flex-col gap-2 px-6 py-0 pb-5 md:pb-6">{dialog}</div>
    </Card>
  );
}

export function DialogBackup({ open, onOpenChange }: DialogBackupProps = {}) {
  const { mnemonic } = useOnboardingStore();
  const t = useTranslations('settings.backup');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <DialogTrigger asChild>
          <Button
            id="backup-btn"
            variant="outline"
            className="border text-xs font-bold text-primary-foreground shadow-sm hover:text-primary-foreground"
          >
            {t('title')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-sm p-6 md:max-w-xl md:p-8" hiddenTitle={t('dialogTitle')}>
        <DialogHeader>
          <DialogTitle id="backup-dialog-title" className="text-xl md:text-2xl">
            {t('dialogTitle')}
          </DialogTitle>
          <DialogDescription id="backup-dialog-description">{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <Container className="flex-col gap-3 md:flex-row">
          <BackupMethodCard
            title={t('recoveryPhrase')}
            imageSrc="/images/note.webp"
            imageAlt={t('note')}
            dialog={<DialogBackupPhrase />}
          />
          <BackupMethodCard
            title={t('encryptedFile')}
            imageSrc="/images/folder.webp"
            imageAlt={t('folder')}
            dialog={<DialogBackupEncrypted />}
          />
          <BackupMethodCard
            title={t('exportRing')}
            imageSrc="/images/keyring.webp"
            imageAlt={t('keys')}
            dialog={<DialogBackupExport mnemonic={mnemonic} />}
          />
        </Container>
      </DialogContent>
    </Dialog>
  );
}
