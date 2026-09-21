'use client';
import Link from 'next/link';
import { AUTH_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { useSessionRecovery } from '@/hooks/useSessionRecovery/useSessionRecovery';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { DialogRestoreEncryptedFile } from '@/organisms/DialogRestoreEncryptedFile/DialogRestoreEncryptedFile';
import { DialogRestoreRecoveryPhrase } from '@/organisms/DialogRestoreRecoveryPhrase/DialogRestoreRecoveryPhrase';

/** Keeps the current URL and cached account intact while authorization is recovered. */
export function SessionRecovery({ needsAuthorization }: { needsAuthorization: boolean }) {
  const { retry } = useSessionRecovery();
  const { url, isLoading, isExpired, fetchUrl, onAuthorizeClick } = useMobileAuth({ autoFetch: needsAuthorization });
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center" role="status">
      <h1 className="text-xl font-bold">
        {needsAuthorization ? 'Sign in again to continue' : 'Could not restore your session'}
      </h1>
      <p className="text-muted-foreground">
        {needsAuthorization
          ? 'Authorize the same account with Pubky Ring. Your saved data will stay here.'
          : 'Your saved session is still here. Check your connection and try again.'}
      </p>
      {needsAuthorization && (
        <>
          <div className="size-48 rounded-md bg-foreground p-2">
            <QrCodeSlot
              url={url}
              isLoading={isLoading}
              isExpired={isExpired}
              generatingLabel="Generating QR Code..."
              clickToReloadLabel="Try again"
            />
          </div>
          <Button onClick={isExpired ? fetchUrl : onAuthorizeClick} disabled={isLoading}>
            {isExpired ? 'Generate a new code' : 'Open Pubky Ring'}
          </Button>
        </>
      )}
      {needsAuthorization && (
        <div className="flex flex-wrap justify-center gap-3">
          <DialogRestoreRecoveryPhrase onRestore={() => {}} />
          <DialogRestoreEncryptedFile onRestore={() => {}} />
        </div>
      )}
      <Button asChild variant="ghost">
        <Link href={AUTH_ROUTES.LOGOUT}>Sign out</Link>
      </Button>
      <Button variant="secondary" onClick={retry}>
        Retry saved session
      </Button>
    </div>
  );
}
