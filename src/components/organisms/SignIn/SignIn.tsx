'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { CheckCircle, Circle, Key, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { ContentCard } from '@/molecules/Content/Content';
import { Logo } from '@/molecules/Logo/Logo';
import { PageTitle } from '@/molecules/Page/Page';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/use-toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSignInStore } from '@/stores/signIn/signIn.store';
import type { SignInState } from '@/stores/signIn/signIn.types';

// Step configuration for the progress display (labels are translation keys)
const SIGN_IN_STEPS = [
  {
    key: 'profileChecked',
    labelKey: 'verifyingAccount',
  },
  {
    key: 'bootstrapFetched',
    labelKey: 'loadingData',
  },
  {
    key: 'dataPersisted',
    labelKey: 'buildingFeed',
  },
  {
    key: 'homeserverSynced',
    labelKey: 'syncingSettings',
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
  const t = useTranslations('onboarding.signIn');
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
                {t(step.labelKey)}
              </Typography>
            </div>
          );
        })}
      </div>
    </Container>
  );
};
export const SignInContent = () => {
  const t = useTranslations('onboarding.signIn');
  const tCopy = useTranslations('toast.copy');
  const { url, isLoading, isExpired, fetchUrl, copyAuthUrl, isOpeningRing, onAuthorizeClick } = useMobileAuth();
  const authUrlResolved = useSignInStore((state) => state.authUrlResolved);
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
        title: t('linkCopied'),
      });
    } catch (error) {
      Logger.error('Failed to copy auth URL to clipboard:', error);
      toast({
        variant: 'error',
        description: tCopy('copyFailedDesc'),
      });
    }
  };
  const isMobileLaunching = isLoading || isOpeningRing;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Loader2 className="mr-2 size-4 animate-spin" />
      <Typography as="span" overrideDefaults aria-live="polite">
        {isOpeningRing ? t('openingRing') : t('generatingShort')}
      </Typography>
    </>
  ) : isExpired ? (
    <>
      <RefreshCw className="mr-2 size-4" />
      {t('clickToReload')}
    </>
  ) : (
    <>
      <Key className="mr-2 size-4" />
      {t('authorize')}
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
  return (
    <>
      {/** Desktop view */}
      <Container size="container" className="hidden md:flex">
        <SignInHeader />
        <ContentCard layout="column">
          <Container className="items-center justify-center gap-3">
            <button
              type="button"
              className="group relative flex h-[220px] w-[220px] cursor-pointer items-center justify-center rounded-lg bg-foreground p-4"
              onClick={isExpired ? fetchUrl : handleQRClick}
              disabled={isLoading || (!url && !isExpired)}
              aria-label={isExpired ? 'Reload sign-in QR code' : 'Copy authentication link'}
            >
              <QrCodeSlot
                isLoading={isLoading}
                isExpired={isExpired}
                url={url}
                generatingLabel={t('generating')}
                clickToReloadLabel={t('clickToReload')}
                activeQrHasHoverEffect
              />
            </button>
            <Container className="w-56 flex-row items-center justify-between gap-5">
              <Link href="https://apps.apple.com/us/app/pubky-ring/id6739356756">
                <Image src="/images/badge-apple.webp" alt="Apple Store Button Pubky Ring" width={94.5} height={28} />
              </Link>
              <Link href="https://play.google.com/store/apps/details?id=to.pubky.ring">
                <Image src="/images/badge-android.webp" alt="Google Store Button Pubky Ring" width={94.5} height={28} />
              </Link>
            </Container>
          </Container>
        </ContentCard>
      </Container>

      {/** Mobile view */}
      <Container size="container" className="md:hidden">
        <SignInHeader />
        <ContentCard layout="column">
          <Container className="flex-col items-center justify-center gap-6 lg:flex-row">
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
export const SignInFooter = () => {
  const authUrlResolved = useSignInStore((state) => state.authUrlResolved);
  const t = useTranslations('onboarding.signIn');
  if (authUrlResolved) return null;
  return (
    <FooterLinks className="py-6">
      {t.rich('recoveryHint', {
        pubkyRing: (chunks) => (
          <Link href="https://pubkyring.app/" target="_blank" rel="noopener noreferrer">
            {chunks}
          </Link>
        ),
      })}
    </FooterLinks>
  );
};
export const SignInHeader = () => {
  const t = useTranslations('onboarding.signIn');
  return (
    <PageHeader>
      <PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </PageTitle>
      <PageSubtitle>{t('subtitle')}</PageSubtitle>
    </PageHeader>
  );
};
const SignInProgressHeader = () => {
  const t = useTranslations('onboarding.signIn');
  return (
    <PageHeader>
      <Logo className="py-6 lg:hidden" />
      <PageTitle size="large">{t('progressTitle')}</PageTitle>
      <PageSubtitle>{t('progressSubtitle')}</PageSubtitle>
    </PageHeader>
  );
};
