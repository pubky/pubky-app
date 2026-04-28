'use client';

import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Core from '@/core';
import { CheckCircle, Loader2, Circle, QrCode, Key } from 'lucide-react';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';

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
const getStepStatus = (stepKey: StepKey, state: Core.SignInState): StepStatus => {
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
  const state = Core.useSignInStore();
  const t = useTranslations('onboarding.signIn');
  return (
    <Atoms.Container className="items-start justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {SIGN_IN_STEPS.map((step) => {
          const status = getStepStatus(step.key, state);
          return (
            <div key={step.key} className="flex items-center gap-3">
              <StepIcon status={status} />
              <Atoms.Typography
                as="span"
                className={cn(
                  'text-base leading-normal font-light',
                  status === 'completed' && 'font-bold text-foreground',
                  status === 'running' && 'text-foreground',
                  status === 'pending' && 'text-muted-foreground',
                )}
              >
                {t(step.labelKey)}
              </Atoms.Typography>
            </div>
          );
        })}
      </div>
    </Atoms.Container>
  );
};
export const SignInContent = () => {
  const t = useTranslations('onboarding.signIn');
  const { url, isLoading, isExpired, fetchUrl, copyAuthUrl, isOpeningRing, onAuthorizeClick } = useMobileAuth();
  const authUrlResolved = Core.useSignInStore((state) => state.authUrlResolved);
  useEffect(() => {
    // Clear onboarding storage when sign-in flow begins to prevent backup reminders from showing for existing users
    Core.useOnboardingStore.getState().reset();
  }, []);
  const handleQRClick = async () => {
    if (!url) return;
    try {
      await copyAuthUrl();
      Molecules.toast({
        title: t('linkCopied'),
        description: t('linkCopiedDescription'),
      });
    } catch (error) {
      Logger.error('Failed to copy auth URL to clipboard:', error);
    }
  };
  const isMobileLaunching = isLoading || isOpeningRing;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Loader2 className="mr-2 size-4 animate-spin" />
      <Atoms.Typography as="span" overrideDefaults aria-live="polite">
        {isOpeningRing ? t('openingRing') : t('generatingShort')}
      </Atoms.Typography>
    </>
  ) : isExpired ? (
    <>
      <QrCode className="mr-2 size-4" />
      {t('expired')}
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
      <Atoms.Container size="container" className="flex flex-col">
        <SignInProgressHeader />
        <Molecules.ContentCard layout="column">
          <SignInProgress />
        </Molecules.ContentCard>
      </Atoms.Container>
    );
  }
  return (
    <>
      {/** Desktop view */}
      <Atoms.Container size="container" className="hidden md:flex">
        <SignInHeader />
        <Molecules.ContentCard layout="column">
          <Atoms.Container className="items-center justify-center gap-3">
            <button
              type="button"
              className="relative flex h-[220px] w-[220px] cursor-pointer items-center justify-center rounded-lg bg-foreground p-4 transition-opacity hover:opacity-90 active:opacity-80"
              onClick={handleQRClick}
              disabled={isLoading || isExpired || !url}
              aria-label="Copy authentication link"
            >
              {isLoading || (!url && !isExpired) ? (
                <Atoms.Container className="items-center gap-2">
                  <Loader2 className="size-8 animate-spin text-background" />
                  <Atoms.Typography as="small" size="sm" className="text-background">
                    {t('generating')}
                  </Atoms.Typography>
                </Atoms.Container>
              ) : isExpired ? (
                <Atoms.Container className="items-center gap-2">
                  <QrCode className="size-8 text-muted-foreground" />
                  <Atoms.Typography as="small" size="sm" className="text-muted-foreground">
                    {t('expired')}
                  </Atoms.Typography>
                </Atoms.Container>
              ) : (
                <>
                  <QRCodeSVG value={url} size={220} />
                  <Image
                    src="/images/ring-logo.svg"
                    alt="Pubky Ring"
                    width={48}
                    height={48}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                </>
              )}
            </button>
            <Atoms.Container className="w-56 flex-row items-center justify-between gap-5">
              <Atoms.Link href="https://apps.apple.com/us/app/pubky-ring/id6739356756">
                <Image src="/images/badge-apple.webp" alt="Apple Store Button Pubky Ring" width={94.5} height={28} />
              </Atoms.Link>
              <Atoms.Link href="https://play.google.com/store/apps/details?id=to.pubky.ring">
                <Image src="/images/badge-android.webp" alt="Google Store Button Pubky Ring" width={94.5} height={28} />
              </Atoms.Link>
            </Atoms.Container>
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>

      {/** Mobile view */}
      <Atoms.Container size="container" className="md:hidden">
        <SignInHeader />
        <Molecules.ContentCard layout="column">
          <Atoms.Container className="flex-col items-center justify-center gap-6 lg:flex-row">
            <Image src="/images/logo-pubky-ring.svg" alt="Pubky Ring" width={137} height={30} />
            <Atoms.Button
              className="w-full"
              size="lg"
              onClick={onAuthorizeClick}
              disabled={isMobileLaunching || isExpired || !url}
              aria-busy={isMobileLaunching}
              data-testid="button"
            >
              {mobileAuthorizeContent}
            </Atoms.Button>
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>

      <Molecules.DialogAuthExpired open={isExpired} onRefresh={fetchUrl} isLoading={isLoading} />
    </>
  );
};
export const SignInFooter = () => {
  const authUrlResolved = Core.useSignInStore((state) => state.authUrlResolved);
  const t = useTranslations('onboarding.signIn');
  if (authUrlResolved) return null;
  return (
    <Atoms.FooterLinks className="py-6">
      {t.rich('recoveryHint', {
        pubkyRing: (chunks) => (
          <Atoms.Link href="https://pubkyring.app/" target="_blank" rel="noopener noreferrer">
            {chunks}
          </Atoms.Link>
        ),
      })}
    </Atoms.FooterLinks>
  );
};
export const SignInHeader = () => {
  const t = useTranslations('onboarding.signIn');
  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </Molecules.PageTitle>
      <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
    </Atoms.PageHeader>
  );
};
const SignInProgressHeader = () => {
  const t = useTranslations('onboarding.signIn');
  return (
    <Atoms.PageHeader>
      <Molecules.Logo className="py-6 lg:hidden" />
      <Molecules.PageTitle size="large">{t('progressTitle')}</Molecules.PageTitle>
      <Atoms.PageSubtitle>{t('progressSubtitle')}</Atoms.PageSubtitle>
    </Atoms.PageHeader>
  );
};
