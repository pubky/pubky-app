'use client';

import React from 'react';
import Image from 'next/image';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <DialogTrigger asChild>
          <Button
            id="backup-btn"
            variant="outline"
            className="border text-xs font-bold text-primary-foreground shadow-sm hover:text-primary-foreground"
          >
            {'Backup'}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-sm p-6 md:max-w-xl md:p-8" hiddenTitle={'Back up your pubky'}>
        <DialogHeader>
          <DialogTitle id="backup-dialog-title" className="text-xl md:text-2xl">
            {'Back up your pubky'}
          </DialogTitle>
          <DialogDescription id="backup-dialog-description">
            {
              'Safely back up and store the secret seed for your pubky. Which backup method do you prefer? You can choose multiple backup methods if you wish.'
            }
          </DialogDescription>
        </DialogHeader>
        <Container className="flex-col gap-3 md:flex-row">
          <BackupMethodCard
            title={'Recovery phrase'}
            imageSrc="/images/note.webp"
            imageAlt={'Note'}
            dialog={<DialogBackupPhrase />}
          />
          <BackupMethodCard
            title={'Download encrypted file'}
            imageSrc="/images/folder.webp"
            imageAlt={'Folder'}
            dialog={<DialogBackupEncrypted />}
          />
          <BackupMethodCard
            title={'Export to Pubky Ring'}
            imageSrc="/images/keyring.webp"
            imageAlt={'Keys'}
            dialog={<DialogBackupExport mnemonic={mnemonic} />}
          />
        </Container>
      </DialogContent>
    </Dialog>
  );
}
