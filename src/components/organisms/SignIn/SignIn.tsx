'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { CheckCircle, Circle, Key, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { usePassportAuth } from '@/hooks/usePassportAuth/usePassportAuth';
import type { PassportAttemptSettledEvent } from '@/hooks/usePassportAuth/usePassportAuth.types';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { BalancedQrCard } from '@/molecules/BalancedQrCard/BalancedQrCard';
import { ContentCard } from '@/molecules/Content/Content';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import { Logo } from '@/molecules/Logo/Logo';
import { PageTitle } from '@/molecules/Page/Page';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/toast';
import { PassportMethodCard, PassportMethodSection } from '@/organisms/PassportMethodCard/PassportMethodCard';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSignInStore } from '@/stores/signIn/signIn.store';
import type { SignInState } from '@/stores/signIn/signIn.types';

const SOVEREIGN_METHOD_TITLE = 'Sovereign & Secure';

// Step configuration for the progress display
const SIGN_IN_STEPS = [
  {
    key: 'profileChecked',
    label: 'Verifying account',
  },
  {
    key: 'bootstrapFetched',
    label: 'Loading your data',
  },
  {
    key: 'dataPersisted',
    label: 'Building your feed',
  },
  {
    key: 'homeserverSynced',
    label: 'Syncing settings',
  },
] as const;
type StepKey = (typeof SIGN_IN_STEPS)[number]['key'];
type StepStatus = 'completed' | 'running' | 'pending';
const getStepStatus = (stepKey: StepKey, state: SignInState): StepStatus => {
  if (state[stepKey]) return 'completed';

  // Find the first false step (currently running)
  const firstPendingKey = SIGN_IN_STEPS.find((step) => !state[step.key])?.key;
  if (stepKey === firstPendingKey) return 'running';
  return 'pending';
};
const StepIcon = ({ status }: { status: StepStatus }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-6 w-6 text-brand" />;
    case 'running':
      return <Loader2 className="h-6 w-6 animate-spin text-brand" />;
    case 'pending':
      return <Circle className="h-6 w-6 text-muted-foreground" />;
  }
};
const SignInProgress = () => {
  const state = useSignInStore();
  return (
    <Container className="items-start justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {SIGN_IN_STEPS.map((step) => {
          const status = getStepStatus(step.key, state);
          return (
            <div key={step.key} className="flex items-center gap-3">
              <StepIcon status={status} />
              <Typography
                as="span"
                className={cn(
                  'text-base leading-normal font-light',
                  status === 'completed' && 'font-bold text-foreground',
                  status === 'running' && 'text-foreground',
                  status === 'pending' && 'text-muted-foreground',
                )}
              >
                {step.label}
              </Typography>
            </div>
          );
        })}
      </div>
    </Container>
  );
};
export const SignInContent = () => {
  const { url, isLoading, isExpired, fetchUrl, copyAuthUrl, isOpeningRing, onAuthorizeClick } = useMobileAuth();
  const authUrlResolved = useSignInStore((state) => state.authUrlResolved);
  const passportEligibility = usePassportEligibility();
  const isPassportEnabled = passportEligibility === 'enabled';
  // Starting Passport cancels the pending Ring request (single active auth flow), which expires the QR.
  // Regenerate it exactly once per Passport attempt that genuinely failed. Never on `session`
  // (RouteGuard navigates away), `superseded` (another sign-in, e.g. a recovery phrase, owns the
  // session and is bootstrapping: a new Ring flow would clear its database) or `popup-blocked`
  // (no flow was started, the Ring request on screen is still valid).
  const ringRefetchedForAttemptRef = useRef<string | null>(null);
  const handlePassportAttemptSettled = ({ attemptId, result }: PassportAttemptSettledEvent) => {
    if (result !== 'failed') return;
    if (ringRefetchedForAttemptRef.current === attemptId) return;
    ringRefetchedForAttemptRef.current = attemptId;
    if (isLoading) return;
    void fetchUrl();
  };
  const { startPassportAuth, isPending: isPassportPending } = usePassportAuth({
    onAttemptSettled: handlePassportAttemptSettled,
  });
  useEffect(() => {
    // Clear onboarding storage when sign-in flow begins to prevent backup reminders from showing for existing users
    useOnboardingStore.getState().reset();
  }, []);
  const handleQRClick = async () => {
    if (!url) return;
    try {
      await copyAuthUrl();
      toast({
        variant: 'info',
        title: 'Authentication link copied',
      });
    } catch (error) {
      Logger.error('Failed to copy auth URL to clipboard:', error);
      toast({
        variant: 'error',
        description: 'Could not copy to clipboard',
      });
    }
  };
  const isMobileLaunching = isLoading || isOpeningRing;
  const isRingLocked = isPassportPending;
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

  // Show progress steps once auth URL is resolved
  if (authUrlResolved) {
    return (
      <Container size="container" className="flex flex-col">
        <SignInProgressHeader />
        <ContentCard layout="column">
          <SignInProgress />
        </ContentCard>
      </Container>
    );
  }
  const qrButton = (
    <button
      type="button"
      className="group relative flex size-48 cursor-pointer items-center justify-center rounded-md bg-foreground p-2"
      onClick={isExpired ? fetchUrl : handleQRClick}
      disabled={isLoading || isRingLocked || (!url && !isExpired)}
      aria-label={isExpired ? 'Reload sign-in QR code' : 'Copy authentication link'}
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
  );

  const mobileRingButton = (
    <Button
      className="w-full"
      size="lg"
      onClick={onAuthorizeClick}
      disabled={isMobileLaunching || isRingLocked || (!url && !isExpired)}
      aria-busy={isMobileLaunching}
      data-testid="button"
    >
      {mobileAuthorizeContent}
    </Button>
  );

  return (
    <>
      <Container size="container" className="hidden md:flex">
        <SignInHeader isPassportEnabled={isPassportEnabled} />
        {isPassportEnabled ? (
          <Container className="flex-row items-stretch gap-6" data-testid="sign-in-methods">
            <IllustratedCard
              data-testid="sign-in-ring-card"
              className="flex-1 rounded-md"
              visual={
                <Image
                  priority
                  src="/images/keyring.webp"
                  alt="Lime Pubky keyring representing keys you control"
                  width={192}
                  height={192}
                  className="size-48"
                />
              }
            >
              <Container className="gap-3">
                <Typography as="h3" size="lg" className="leading-8">
                  {SOVEREIGN_METHOD_TITLE}
                </Typography>
                <Typography as="p" className="leading-6 text-secondary-foreground/80">
                  {'Scan with '}
                  <span className="text-brand">{'Pubky Ring'}</span>
                  {' or '}
                  <span className="text-brand">{'Bitkit'}</span>
                  {'.'}
                </Typography>
              </Container>
              {qrButton}
            </IllustratedCard>
            <PassportMethodCard onContinue={startPassportAuth} isPending={isPassportPending} />
          </Container>
        ) : (
          <BalancedQrCard
            data-testid="sign-in-qr-card"
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
            {qrButton}
          </BalancedQrCard>
        )}
      </Container>

      {/** Mobile view */}
      <Container size="container" className="md:hidden">
        <SignInHeader isPassportEnabled={isPassportEnabled} />
        {isPassportEnabled ? (
          <Container className="gap-6" data-testid="sign-in-methods-mobile">
            <Container className="gap-3">
              <Typography as="p" size="xs" className="tracking-[1.2px] text-muted-foreground uppercase">
                {SOVEREIGN_METHOD_TITLE}
              </Typography>
              {mobileRingButton}
            </Container>
            <PassportMethodSection onContinue={startPassportAuth} isPending={isPassportPending} />
          </Container>
        ) : (
          <ContentCard layout="column">
            <Container className="flex-col items-center justify-center gap-6">
              <Image src="/images/logo-pubky-ring.svg" alt="Pubky Ring" width={137} height={30} />
              {mobileRingButton}
            </Container>
          </ContentCard>
        )}
      </Container>
    </>
  );
};
export const SignInFooter = () => {
  const authUrlResolved = useSignInStore((state) => state.authUrlResolved);
  if (authUrlResolved) return null;
  return (
    <FooterLinks className="py-6">
      {'Not able to sign in with '}
      <Link href="https://pubkyring.app/" target="_blank" rel="noopener noreferrer">
        {'Pubky Ring'}
      </Link>
      {'? Use the recovery phrase or encrypted file to restore your account.'}
    </FooterLinks>
  );
};
export const SignInHeader = ({ isPassportEnabled = false }: { isPassportEnabled?: boolean }) => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {'Sign in to '}
        <span className="text-brand">{'Pubky.'}</span>
      </PageTitle>
      <PageSubtitle>
        {isPassportEnabled ? (
          'Choose your preferred method to sign in.'
        ) : (
          <>
            {'Authorize with '}
            <span className="text-brand">{'Pubky Ring'}</span>
            {' to sign in.'}
          </>
        )}
      </PageSubtitle>
    </PageHeader>
  );
};
const SignInProgressHeader = () => {
  return (
    <PageHeader>
      <Logo className="py-6 lg:hidden" />
      <PageTitle size="large">{'Signing in.'}</PageTitle>
      <PageSubtitle>{'Please wait while your Pubky experience loads.'}</PageSubtitle>
    </PageHeader>
  );
};
