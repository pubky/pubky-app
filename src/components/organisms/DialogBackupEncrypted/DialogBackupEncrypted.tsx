'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import { ProfileController } from '@/controllers/profile/profile';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { calculatePasswordStrength, getStrengthColor } from '@/libs/password/password';

interface DialogBackupEncryptedProps {
  children?: React.ReactNode;
}
function RecoveryStep1({ setStep }: { setStep: (step: number) => void }) {
  const t = useTranslations('onboarding.backupEncrypted');
  const tCommon = useTranslations('common');
  const tPassword = useTranslations('password');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const passphraseStrength = calculatePasswordStrength(passphrase);
  const passphraseMatch = passphrase === confirmPassphrase && passphrase !== '';
  const handleDownload = () => {
    ProfileController.createRecoveryFile(passphrase);
    setStep(2);
  };
  const isFormValid = () => {
    return Boolean(passphrase && passphraseMatch);
  };
  const handleKeyDown = useEnterSubmit(isFormValid, handleDownload);
  const getStrengthText = (strength: number): string => {
    if (strength === 0) return '';
    if (strength <= 2) return tPassword('weak');
    if (strength <= 3) return tPassword('fair');
    if (strength <= 4) return tPassword('good');
    return tPassword('strong');
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>
          {t('subtitle')}{' '}
          <span className="font-bold text-foreground">
            <span className="hidden sm:inline">{t('neverShareDesktop')}</span>
            <span className="sm:hidden">{t('neverShareMobile')}</span>
          </span>
        </DialogDescription>
      </DialogHeader>

      <Container className="gap-6">
        <Container>
          <Label htmlFor="password" className="pb-4 text-xs font-medium tracking-widest text-muted-foreground">
            {t('password')}
          </Label>
          <Container>
            <Container className="relative pb-3">
              <Input
                id="password"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-opacity-90 h-14 rounded-md border border-dashed px-5 py-4 shadow-sm"
                placeholder={t('passwordPlaceholder')}
                autoComplete="new-password"
                aria-describedby="password-help"
              />
            </Container>
            <Typography id="password-help" size="sm" className="text-xs leading-none font-medium text-muted-foreground">
              {t('passwordHint')}
            </Typography>
          </Container>
        </Container>

        <Container className="items-start">
          {passphrase && (
            <Container className="flex-row items-center justify-start gap-3">
              {[1, 2, 3, 4, 5].map((index) => (
                <div
                  key={index}
                  className={`h-3 w-6 rounded-lg ${index <= passphraseStrength.strength ? 'bg-brand' : 'bg-muted'}`}
                ></div>
              ))}
              <span
                className={`text-xs font-medium ${getStrengthColor(passphraseStrength.strength)}`}
                role="status"
                aria-live="polite"
              >
                {getStrengthText(passphraseStrength.strength)}
              </span>
            </Container>
          )}
        </Container>

        <Container>
          <Label htmlFor="confirmPassword" className="pb-4 text-xs font-medium tracking-widest text-muted-foreground">
            {t('repeatPassword')}
          </Label>
          <Container className="pb-3">
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`bg-opacity-90 h-14 rounded-md border border-dashed px-5 py-4 shadow-sm ${confirmPassphrase && !passphraseMatch ? 'border-destructive' : ''}`}
              placeholder={t('repeatPasswordPlaceholder')}
              autoComplete="new-password"
              aria-invalid={Boolean(confirmPassphrase && !passphraseMatch)}
              aria-describedby={confirmPassphrase && !passphraseMatch ? 'confirm-password-error' : undefined}
            />
            {confirmPassphrase && !passphraseMatch && (
              <Typography
                id="confirm-password-error"
                size="sm"
                className="pt-3 text-xs leading-3 font-medium text-destructive"
              >
                {t('passwordsDoNotMatch')}
              </Typography>
            )}
          </Container>
        </Container>
      </Container>

      <DialogFooter>
        <Button
          id="download-file-btn"
          size="lg"
          onClick={handleDownload}
          disabled={!isFormValid()}
          className="order-2 sm:order-1"
        >
          <Download className="h-4 w-4" />
          {t('downloadFile')}
        </Button>
        <DialogClose asChild>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              setStep(1);
            }}
            className="order-1 sm:order-2"
          >
            {tCommon('cancel')}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
function RecoveryStep2({ handleClose }: { handleClose: () => void }) {
  const t = useTranslations('onboarding.backupEncrypted');
  const tCommon = useTranslations('common');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('completeTitle')}</DialogTitle>
        <DialogDescription>{t('completeSubtitle')}</DialogDescription>
      </DialogHeader>

      <Container>
        <Container className="flex w-full items-center justify-center rounded-md bg-card p-12">
          <Image src="/images/check.webp" alt="Backup Complete" width={180} height={180} className="h-48 w-48" />
        </Container>
      </Container>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="lg" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button id="backup-successful-ok-btn" size="lg" onClick={handleClose}>
            <ArrowRight className="h-4 w-4" />
            {tCommon('finish')}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
export function DialogBackupEncrypted({ children }: DialogBackupEncryptedProps) {
  const [step, setStep] = useState(1);
  const handleClose = () => {
    //delay 1 second
    setTimeout(() => {
      setStep(1);
    }, 1000);
  };
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setStep(1);
      }}
    >
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button id="backup-encrypted-file-btn">Continue</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md sm:max-w-lg" hiddenTitle="Backup as encrypted file">
        {step === 1 && <RecoveryStep1 setStep={setStep} />}
        {step === 2 && <RecoveryStep2 handleClose={handleClose} />}
      </DialogContent>
    </Dialog>
  );
}
