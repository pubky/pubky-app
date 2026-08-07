'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Key, Loader2, RefreshCw } from 'lucide-react';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { getPubkyCoreLink, getPubkyRingLink } from '@/config/externalLinks';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { Logger } from '@/libs/logger/logger';
import { BalancedQrCard } from '@/molecules/BalancedQrCard/BalancedQrCard';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { ContentCard } from '@/molecules/Content/Content';
import { PageTitle } from '@/molecules/Page/Page';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export const ScanContent = () => {
  const router = useRouter();
  const inviteCode = useOnboardingStore((state) => state.inviteCode);
  const hasInviteCode = inviteCode.trim().length > 0;
  useEffect(() => {
    if (!hasInviteCode) {
      Logger.warn('[Scan] Missing inviteCode on signup screen; redirecting to invite flow');
      router.replace(ONBOARDING_ROUTES.HUMAN);
    }
  }, [hasInviteCode, router]);
  const { url, isLoading, isExpired, fetchUrl, isOpeningRing, onAuthorizeClick } = useMobileAuth(
    hasInviteCode
      ? {
          type: 'signup',
          inviteCode,
        }
      : {
          autoFetch: false,
        },
  );
  if (!hasInviteCode) return null;
  const isMobileLaunching = isLoading || isOpeningRing;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Loader2 className="mr-2 size-4 animate-spin" />
      <Typography as="span" overrideDefaults aria-live="polite">
        {isOpeningRing ? 'Opening Pubky Ring...' : 'Generating...'}
      </Typography>
    </>
  ) : isExpired ? (
    <>
      <RefreshCw className="mr-2 size-4" />
      {'Click to reload'}
    </>
  ) : (
    <>
      <Key className="mr-2 size-4" />
      {'Authorize with Pubky Ring'}
    </>
  );
  return (
    <>
      <Container size="container" className="hidden md:flex">
        <ScanHeader isMobile={false} />
        <BalancedQrCard
          data-testid="scan-qr-card"
          illustration={
            <Image
              priority
              src="/images/scan.webp"
              alt="Pubky Ring phone scanning a QR code"
              width={192}
              height={192}
              className="size-48"
            />
          }
        >
          <div className="relative flex size-48 items-center justify-center rounded-md bg-foreground p-2">
            <QrCodeSlot
              isLoading={isLoading}
              isExpired={isExpired}
              url={url}
              generatingLabel={'Generating QR Code...'}
              clickToReloadLabel={'Click to reload'}
              expiredReloadAction={{ onClick: fetchUrl, ariaLabel: 'Reload sign-up QR code' }}
            />
          </div>
        </BalancedQrCard>
      </Container>

      {/** Mobile view */}
      <Container size="container" className="md:hidden">
        <ScanHeader isMobile={true} />
        <ContentCard layout="column">
          <Container className="flex-col items-center justify-center gap-12 lg:flex-row">
            <Image src="/images/logo-pubky-ring.svg" alt="Pubky Ring" width={137} height={30} />
            <Button
              className="w-full"
              size="lg"
              onClick={onAuthorizeClick}
              disabled={isMobileLaunching || (!url && !isExpired)}
              aria-busy={isMobileLaunching}
              data-testid="button"
            >
              {mobileAuthorizeContent}
            </Button>
          </Container>
        </ContentCard>
      </Container>
    </>
  );
};
export const ScanFooter = () => {
  return (
    <FooterLinks className="py-6">
      {'Use '}
      <Link href={getPubkyRingLink()} target="_blank">
        {'Pubky Ring'}
      </Link>
      {' or any other '}
      <Link href={getPubkyCoreLink()} target="_blank">
        {'Pubky Core'}
      </Link>
      {'–powered keychain.'}
    </FooterLinks>
  );
};
export const ScanHeader = ({ isMobile }: { isMobile: boolean }) => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {isMobile ? (
          <>
            {'Tap to '}
            <span className="text-brand">{'Authorize.'}</span>
          </>
        ) : (
          <>
            {'Scan '}
            <span className="text-brand">{'QR Code.'}</span>
          </>
        )}
      </PageTitle>
      <PageSubtitle>
        {isMobile
          ? 'Tap the button to open Pubky Ring, and authorize with your pubky.'
          : "Open Pubky Ring, tap 'add pubky', and scan this QR."}
      </PageSubtitle>
    </PageHeader>
  );
};
export const ScanNavigation = () => {
  const router = useRouter();
  const onHandleBackButton = () => {
    router.push(ONBOARDING_ROUTES.INSTALL);
  };
  return (
    <ButtonsNavigation
      id="scan-navigation"
      continueButtonDisabled={true}
      hiddenContinueButton={true}
      onHandleBackButton={onHandleBackButton}
    />
  );
};
