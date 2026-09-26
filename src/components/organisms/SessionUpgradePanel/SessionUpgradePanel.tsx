'use client';

import { Key, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { getAppStoreLink, getPlayStoreLink, getPubkyRingLink } from '@/config/externalLinks';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { copyToClipboard } from '@/libs/utils/utils';
import { AppDownload } from '@/molecules/AppDownload/AppDownload';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/toast';

/** The dialog copy that goes with the panel, shared by the creator setup and the reader notice. */
export function SessionUpgradeDescription() {
  return (
    <>
      {'Use '}
      <Link href={getPubkyRingLink()} className="text-base font-bold">
        {'Pubky Ring'}
      </Link>
      {' to authorize Pubky.app to access your private Locks data.'}
    </>
  );
}

/**
 * Asks Pubky Ring for a session with today's capability list and swaps it in on approval (#2373).
 * Starts the flow on mount, so mount it only while it is on screen.
 */
export function SessionUpgradePanel() {
  const { url, isLoading, isExpired, fetchUrl, isOpeningRing, onAuthorizeClick } = useMobileAuth({
    type: 'upgrade',
  });
  const isLaunching = isLoading || isOpeningRing;

  // Same affordance as the sign-in QR: a desktop tester (and anyone pairing over a call) needs the
  // link itself, not a picture of it.
  // `copyToClipboard` rather than the hook's `copyAuthUrl`: that one logs a failure and resolves,
  // so a rejected clipboard write would still be reported as copied.
  const handleQrClick = async () => {
    if (!url) return;
    try {
      await copyToClipboard({ text: url });
      toast({ variant: 'info', title: 'Authorization link copied' });
    } catch {
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  return (
    <Container className="flex flex-col items-center justify-center gap-6 py-3">
      <button
        type="button"
        data-testid="session-upgrade-qr"
        // Device split spelled out: Tailwind scans source text, so a class built from a template
        // literal is never generated. A phone cannot scan its own screen, hence the QR/button swap.
        className="group relative flex size-48 cursor-pointer items-center justify-center rounded-md bg-foreground p-2 [@media(hover:none)and(pointer:coarse)]:hidden"
        onClick={isExpired ? fetchUrl : handleQrClick}
        disabled={isLoading || (!url && !isExpired)}
        aria-label={isExpired ? 'Reload authorization QR code' : 'Copy authorization link'}
      >
        <QrCodeSlot
          isLoading={isLoading}
          isExpired={isExpired}
          url={url}
          generatingLabel={'Generating QR Code...'}
          clickToReloadLabel={'Click to reload'}
          activeQrHasHoverEffect
        />
      </button>
      <Button
        size="lg"
        className="hidden w-full [@media(hover:none)and(pointer:coarse)]:flex"
        onClick={onAuthorizeClick}
        disabled={isLaunching || (!url && !isExpired)}
        aria-busy={isLaunching}
      >
        {isLaunching ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {isOpeningRing ? 'Opening Pubky Ring...' : 'Generating...'}
          </>
        ) : isExpired ? (
          <>
            <RefreshCw className="mr-2 size-4" />
            {'Click to reload'}
          </>
        ) : (
          <>
            <Key className="mr-2 size-4" />
            {'Continue with Pubky Ring'}
          </>
        )}
      </Button>
      <AppDownload
        logo={{ src: '/images/logo-pubky-ring.svg', alt: 'Pubky Ring', width: 147 }}
        appStoreUrl={getAppStoreLink()}
        playStoreUrl={getPlayStoreLink()}
      />
    </Container>
  );
}
