'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Download } from 'lucide-react';
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
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { ProfileController } from '@/controllers/profile/profile';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { calculatePasswordStrength, PASSPHRASE_MIN_LENGTH } from '@/libs/password/password';

const PASSPHRASE_LINK_URL = 'https://www.useapassphrase.com';

function getStrengthText(strength: number): string {
  if (strength === 0) return '';
  if (strength === 1) return 'Very weak';
  if (strength === 2) return 'Weak';
  if (strength === 3) return 'Moderate';
  if (strength === 4) return 'Strong';
  return 'Very strong';
}

function getStrengthColor(strength: number): string {
  if (strength <= 2) return 'text-red-400';
  if (strength <= 3) return 'text-yellow-400';
  if (strength <= 4) return 'text-blue-400';
  return 'text-green-400';
}

interface DialogBackupEncryptedProps {
  children?: React.ReactNode;
}
function RecoveryStep1({ setStep }: { setStep: (step: number) => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const passphraseStrength = calculatePasswordStrength(passphrase);
  const passphraseMatch = passphrase === confirmPassphrase;
  const showWeakWarning = passphrase.length < PASSPHRASE_MIN_LENGTH;

  const handleDownload = () => {
    ProfileController.createRecoveryFile(passphrase);
    setStep(2);
  };
  const isFormValid = () => {
    return passphraseMatch;
  };
  const handleKeyDown = useEnterSubmit(isFormValid, handleDownload);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{'Backup as encrypted file'}</DialogTitle>
        <DialogDescription>
          {
            'Encrypt your recovery file below with a secure password, download it, and save it to your computer or cloud provider.'
          }{' '}
          <span className="font-bold text-foreground">
            <span className="hidden sm:inline">{'Never share this file with anyone.'}</span>
            <span className="sm:hidden">{'Never share this file and password with anyone.'}</span>
          </span>
        </DialogDescription>
      </DialogHeader>

      <Container className="gap-6">
        <Container>
          <Label htmlFor="password" className="pb-4 text-xs font-medium tracking-widest text-muted-foreground">
            {'PASSWORD'}
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
                placeholder={'Enter a strong password'}
                autoComplete="new-password"
                aria-describedby="password-help"
              />
            </Container>
            <Typography id="password-help" size="sm" className="text-xs leading-none font-medium text-muted-foreground">
              We recommend using a long{' '}
              <Link href={PASSPHRASE_LINK_URL} target="_blank" rel="noopener noreferrer">
                passphrase
              </Link>{' '}
              <span className={showWeakWarning ? 'text-destructive' : undefined}>over 16 characters</span> for better
              security.
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
            {'REPEAT PASSWORD'}
          </Label>
          <Container className="pb-3">
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`bg-opacity-90 h-14 rounded-md border border-dashed px-5 py-4 shadow-sm ${confirmPassphrase && !passphraseMatch ? 'border-destructive' : ''}`}
              placeholder={'Repeat your password'}
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
                {'Passwords do not match'}
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
          {'Download file'}
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
            {'Cancel'}
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
function RecoveryStep2({ handleClose }: { handleClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{'Backup complete'}</DialogTitle>
        <DialogDescription>
          {'You can use your backed up encrypted file to restore your account again later.'}
        </DialogDescription>
      </DialogHeader>

      <Container>
        <Container className="flex w-full items-center justify-center rounded-md bg-card p-12">
          <Image src="/images/check.webp" alt="Backup Complete" width={180} height={180} className="h-48 w-48" />
        </Container>
      </Container>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="lg" onClick={handleClose}>
            {'Cancel'}
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button id="backup-successful-ok-btn" size="lg" onClick={handleClose}>
            <ArrowRight className="h-4 w-4" />
            {'Finish'}
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
