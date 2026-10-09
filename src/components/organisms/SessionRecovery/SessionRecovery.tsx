'use client';
import Link from 'next/link';
import { AUTH_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { PAGE_GUTTER_CLASS } from '@/config/layoutClasses';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { usePassportAuth } from '@/hooks/usePassportAuth/usePassportAuth';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { useSessionRecovery } from '@/hooks/useSessionRecovery/useSessionRecovery';
import { cn } from '@/libs/utils/utils';
import { ContinueWithPassport } from '@/molecules/ContinueWithPassport/ContinueWithPassport';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/toast';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { DialogRestoreEncryptedFile } from '@/organisms/DialogRestoreEncryptedFile/DialogRestoreEncryptedFile';
import { DialogRestoreRecoveryPhrase } from '@/organisms/DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Keeps the current URL and cached account intact while authorization is recovered. */
export function SessionRecovery({
  needsAuthorization,
  compact = false,
}: {
  needsAuthorization: boolean;
  compact?: boolean;
}) {
  const isMobile = useIsMobile();
  const { retry, hasSavedKey, isRecoveringKey, recoverSavedKey } = useSessionRecovery();
  const { url, isLoading, isExpired, fetchUrl, onAuthorizeClick, copyAuthUrl, isOpeningRing } = useMobileAuth({
    autoFetch: needsAuthorization,
  });
  const passportEligibility = usePassportEligibility();
  const copyLink = async () => {
    try {
      await copyAuthUrl();
      toast({ variant: 'info', title: 'Authentication link copied' });
    } catch {
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };
  const { startPassportAuth, isPending: isPassportPending } = usePassportAuth({
    onAttemptSettled: ({ result }) => {
      // Passport replaces the Ring request. Restore its QR only after a failed attempt,
      // never after a successful or superseded adoption.
      if (result === 'failed' && needsAuthorization && !isLoading) void fetchUrl();
    },
  });
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 py-6 text-center',
        !compact && 'min-h-screen',
        PAGE_GUTTER_CLASS,
      )}
      role="status"
    >
      <h1 className="text-xl font-bold">
        {needsAuthorization ? 'Sign in again to continue' : 'Could not restore your session'}
      </h1>
      <p className="text-muted-foreground">
        {needsAuthorization
          ? 'Sign in to the same account. Your saved data will stay here.'
          : 'Your saved session is still here. Check your connection and try again.'}
      </p>
      <AlertBackup />
      {hasSavedKey && (
        <Button onClick={recoverSavedKey} disabled={isRecoveringKey || isPassportPending}>
          {isRecoveringKey ? 'Signing in...' : 'Sign in with saved key'}
        </Button>
      )}
      {needsAuthorization && (
        <>
          <div className="relative flex size-48 items-center justify-center rounded-md bg-foreground p-2">
            <QrCodeSlot
              url={url}
              isLoading={isLoading}
              isExpired={isExpired}
              generatingLabel="Generating QR Code..."
              clickToReloadLabel="Try again"
              expiredReloadAction={{ onClick: fetchUrl, ariaLabel: 'Reload expired QR code' }}
            />
          </div>
          <Button onClick={isExpired ? fetchUrl : onAuthorizeClick} disabled={isLoading || isPassportPending}>
            {isExpired
              ? 'Generate a new code'
              : isMobile && isOpeningRing
                ? 'Opening Pubky Ring...'
                : 'Open Pubky Ring'}
          </Button>
          <Button variant="ghost" onClick={copyLink} disabled={!url || isExpired || isPassportPending}>
            Copy sign-in link
          </Button>
        </>
      )}
      {needsAuthorization && passportEligibility === 'enabled' && (
        <ContinueWithPassport onContinue={startPassportAuth} isPending={isPassportPending} />
      )}
      {needsAuthorization && (
        <div className="flex flex-wrap justify-center gap-3">
          <DialogRestoreRecoveryPhrase onRestore={() => {}} />
          <DialogRestoreEncryptedFile onRestore={() => {}} />
        </div>
      )}
      <Button asChild variant="ghost">
        <Link href={AUTH_ROUTES.LOGOUT} onClick={() => useAuthStore.getState().setShowSignInDialog(false)}>
          Sign out
        </Link>
      </Button>
      <Button variant="secondary" onClick={retry} disabled={isPassportPending || isRecoveringKey}>
        Retry saved session
      </Button>
    </div>
  );
}
