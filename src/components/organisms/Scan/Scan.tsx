'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { ONBOARDING_ROUTES, type OnboardingKeychain, parseOnboardingKeychain } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { Logger } from '@/libs/logger/logger';
import { isIosDevice } from '@/libs/pwa/platform';
import { AuthQrCopyButton } from '@/molecules/AuthQrCopyButton/AuthQrCopyButton';
import { BalancedQrCard } from '@/molecules/BalancedQrCard/BalancedQrCard';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '@/molecules/Page/Page';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

const noopSubscribe = () => () => {};
const getServerIsIos = () => false;

const KEYCHAINS = {
  ring: {
    name: 'Pubky Ring',
    openingLabel: 'Opening Pubky Ring...',
    logo: { src: '/images/logo-pubky-ring.svg', alt: 'Pubky Ring', width: 147, height: 32 },
    qrLogo: undefined,
    steps: ['Open Pubky Ring', 'Tap ‘Add pubky’', 'Choose ‘Signup QR’', 'Scan this QR', 'Authorize in the app'],
  },
  bitkit: {
    name: 'Bitkit',
    openingLabel: 'Opening Bitkit...',
    logo: { src: '/images/bitkit-logo.svg', alt: 'Bitkit', width: 110, height: 32 },
    qrLogo: { src: '/images/bitkit-qr-logo.svg', alt: 'Bitkit' },
    steps: ['Open Bitkit', 'Tap ‘Scan’ icon', 'Scan this QR', 'Authorize in Bitkit'],
  },
} satisfies Record<OnboardingKeychain, unknown>;

/**
 * The keychain picked on the Install step (`?keychain=bitkit`). Bitkit iOS cannot open a sign-up
 * request from a link, so an iOS device always gets Pubky Ring, as the Install step offers.
 */
const useScanKeychain = (): OnboardingKeychain => {
  const searchParams = useSearchParams();
  const isIos = useSyncExternalStore(noopSubscribe, isIosDevice, getServerIsIos);
  const keychain = parseOnboardingKeychain(searchParams.get('keychain'));
  return isIos ? 'ring' : keychain;
};

export const ScanContent = () => {
  const router = useRouter();
  const keychain = useScanKeychain();
  const inviteCode = useOnboardingStore((state) => state.inviteCode);
  const hasInviteCode = inviteCode.trim().length > 0;
  useEffect(() => {
    if (!hasInviteCode) {
      Logger.warn('[Scan] Missing inviteCode on signup screen; redirecting to invite flow');
      router.replace(ONBOARDING_ROUTES.HUMAN);
    }
  }, [hasInviteCode, router]);
  const {
    url,
    isLoading,
    isExpired,
    fetchUrl,
    copyAuthUrl,
    isOpeningRing,
    onAuthorizeClick,
    isOpeningBitkit,
    onAuthorizeBitkitClick,
  } = useMobileAuth(
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
  const { name, openingLabel, logo, qrLogo, steps } = KEYCHAINS[keychain];
  const isBitkit = keychain === 'bitkit';
  const isOpening = isBitkit ? isOpeningBitkit : isOpeningRing;
  const isMobileLaunching = isLoading || isOpening;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Loader2 className="size-4 animate-spin" />
      <Typography as="span" overrideDefaults aria-live="polite">
        {isOpening ? openingLabel : 'Generating...'}
      </Typography>
    </>
  ) : isExpired ? (
    <>
      <RefreshCw className="size-4" />
      {'Click to reload'}
    </>
  ) : (
    <>
      <KeyRound className="size-4" />
      {'Authorize & configure'}
    </>
  );
  return (
    <>
      <Container size="container" className="hidden md:flex">
        <ScanHeader isMobile={false} keychainName={name} />
        <BalancedQrCard
          data-testid="scan-qr-card"
          illustration={
            <Image
              priority
              src="/images/scan.webp"
              alt={`${name} phone scanning a QR code`}
              width={192}
              height={192}
              className="size-48"
            />
          }
          aside={
            <ol className="list-decimal pl-6 text-base leading-6 font-medium text-secondary-foreground">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          }
        >
          <AuthQrCopyButton
            url={url}
            isLoading={isLoading}
            isExpired={isExpired}
            onCopy={copyAuthUrl}
            onReload={fetchUrl}
            reloadAriaLabel={'Reload sign-up QR code'}
            logo={qrLogo}
          />
        </BalancedQrCard>
      </Container>

      {/** Mobile view */}
      <Container size="container" className="md:hidden">
        <ScanHeader isMobile={true} keychainName={name} />
        <Container className="items-center gap-6 rounded-md bg-card p-6" data-testid="scan-authorize-card">
          <Image src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} className="h-8 w-auto" />
          <Button
            className="h-15 w-full border-0 leading-5"
            variant={ButtonVariant.SECONDARY}
            size="lg"
            onClick={isBitkit ? onAuthorizeBitkitClick : onAuthorizeClick}
            disabled={isMobileLaunching || (!url && !isExpired)}
            aria-busy={isMobileLaunching}
            data-testid="button"
          >
            {mobileAuthorizeContent}
          </Button>
        </Container>
      </Container>
    </>
  );
};
export const ScanHeader = ({ isMobile, keychainName }: { isMobile: boolean; keychainName: string }) => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {isMobile ? (
          <>
            {'Authorize '}
            <span className="block text-brand">{'with keychain.'}</span>
          </>
        ) : (
          <>
            {'Scan QR '}
            <span className="text-brand">{'with keychain.'}</span>
          </>
        )}
      </PageTitle>
      <PageSubtitle>
        {isMobile
          ? `Tap below to open ${keychainName} and automatically configure your pubky.`
          : `Use ${keychainName} and follow the instructions below.`}
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
