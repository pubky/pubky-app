'use client';

import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Core from '@/core';
import * as Hooks from '@/hooks';

// Step configuration for the progress display (labels are translation keys)
const SIGN_IN_STEPS = [
  { key: 'profileChecked', labelKey: 'verifyingAccount' },
  { key: 'bootstrapFetched', labelKey: 'loadingData' },
  { key: 'dataPersisted', labelKey: 'buildingFeed' },
  { key: 'homeserverSynced', labelKey: 'syncingSettings' },
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
      return <Libs.CheckCircle className="h-6 w-6 text-brand" />;
    case 'running':
      return <Libs.Loader2 className="h-6 w-6 animate-spin text-brand" />;
    case 'pending':
      return <Libs.Circle className="h-6 w-6 text-muted-foreground" />;
  }
};

const SignInProgress = () => {
  const state = Core.useSignInStore();
  const t = useTranslations('onboarding.signIn');

  return (
    <Atoms.Container className="items-center justify-center">
      <div className="flex flex-col gap-4">
        {SIGN_IN_STEPS.map((step) => {
          const status = getStepStatus(step.key, state);
          return (
            <div key={step.key} className="flex items-center gap-3">
              <StepIcon status={status} />
              <Atoms.Typography
                as="span"
                className={Libs.cn(
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
  const { url, isLoading, isOpeningRing, onAuthorizeClick } = Hooks.useMobileAuth();
  const authUrlResolved = Core.useSignInStore((state) => state.authUrlResolved);

  useEffect(() => {
    // Clear onboarding storage when sign-in flow begins to prevent backup reminders from showing for existing users
    Core.useOnboardingStore.getState().reset();
  }, []);

  const handleQRClick = async () => {
    if (!url) return;

    try {
      await Libs.copyToClipboard({ text: url });
      Molecules.toast({
        title: t('linkCopied'),
        description: t('linkCopiedDescription'),
      });
    } catch (error) {
      Libs.Logger.error('Failed to copy auth URL to clipboard:', error);
    }
  };

  const isMobileLaunching = isLoading || isOpeningRing;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
      <Atoms.Typography as="span" overrideDefaults aria-live="polite">
        {isOpeningRing ? t('openingRing') : t('generatingShort')}
      </Atoms.Typography>
    </>
  ) : (
    <>
      <Libs.Key className="mr-2 h-4 w-4" />
      {t('authorize')}
    </>
  );
  const mobileAuthorizeButton =
    isMobileLaunching || !url ? (
      <Atoms.Button className="h-[60px] w-full rounded-full" size="lg" disabled aria-busy={isMobileLaunching}>
        {mobileAuthorizeContent}
      </Atoms.Button>
    ) : (
      <Atoms.Button className="h-[60px] w-full rounded-full" size="lg" onClick={onAuthorizeClick} data-testid="button">
        {mobileAuthorizeContent}
      </Atoms.Button>
    );

  // Show progress steps once auth URL is resolved
  if (authUrlResolved) {
    return (
      <Atoms.Container size="container" className="flex flex-col">
        <SignInHeader />
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
          <Atoms.Container className="items-center justify-center">
            <button
              type="button"
              className="relative flex h-[220px] w-[220px] cursor-pointer items-center justify-center rounded-lg bg-foreground p-4 transition-opacity hover:opacity-90 active:opacity-80"
              onClick={handleQRClick}
              disabled={isLoading || !url}
              aria-label="Copy authentication link"
            >
              {isLoading || !url ? (
                <Atoms.Container className="items-center gap-2">
                  <Libs.Loader2 className="h-8 w-8 animate-spin text-background" />
                  <Atoms.Typography as="small" size="sm" className="text-background">
                    {t('generating')}
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
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>

      {/** Mobile view */}
      <Atoms.Container size="container" className="md:hidden">
        <SignInHeader />
        <Molecules.ContentCard layout="column">
          <Atoms.Container className="flex-col items-center justify-center gap-12 lg:flex-row">
            <Image src="/images/logo-pubky-ring.svg" alt="Pubky Ring" width={137} height={30} />
            {mobileAuthorizeButton}
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>
    </>
  );
};

export const SignInFooter = () => {
  const t = useTranslations('onboarding.signIn');
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
