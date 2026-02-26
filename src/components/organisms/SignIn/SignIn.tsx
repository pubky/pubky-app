'use client';

import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Core from '@/core';
import * as Config from '@/config';
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
  const { url, isLoading, isExpired, fetchUrl, copyAuthUrl } = Hooks.useAuthUrl();
  const authUrlResolved = Core.useSignInStore((state) => state.authUrlResolved);
  /** Stores the 2s fallback redirect timer so we can clear it on unmount and avoid redirecting after the user has left. */
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const fallbackUrl = isIOS ? Config.APP_STORE_URL : Config.PLAY_STORE_URL;

  useEffect(() => {
    // Clear onboarding storage when sign-in flow begins to prevent backup reminders from showing for existing users
    Core.useOnboardingStore.getState().reset();
  }, []);

  useEffect(
    () => () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    },
    [],
  );

  const handleQRClick = async () => {
    if (!url) return;

    try {
      await copyAuthUrl();
      Molecules.toast({
        title: t('linkCopied'),
        description: t('linkCopiedDescription'),
      });
    } catch (error) {
      Libs.Logger.error('Failed to copy auth URL to clipboard:', error);
    }
  };

  const handleAuthorizeClick = async () => {
    if (isLoading) return;

    if (!url) {
      void fetchUrl();
      return;
    }

    await copyAuthUrl();

    try {
      const openedWindow = window.open(url, '_blank');

      if (!openedWindow) {
        window.location.href = url;
        return;
      }

      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;
        try {
          openedWindow.location.href = fallbackUrl;
        } catch (error) {
          Libs.Logger.error('Failed to redirect to store after deeplink attempt:', error);
          window.location.href = fallbackUrl;
        }
      }, 2000);
    } catch (error) {
      Libs.Logger.error('Failed to open Pubky Ring deeplink:', error);
      Molecules.toast({
        title: t('linkFailed'),
        description: t('tryAgain'),
      });
      window.location.href = fallbackUrl;
    }
  };

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
              disabled={isLoading || isExpired || !url}
              aria-label="Copy authentication link"
            >
              {isLoading ? (
                <Atoms.Container className="items-center gap-2">
                  <Libs.Loader2 className="h-8 w-8 animate-spin text-background" />
                  <Atoms.Typography as="small" size="sm" className="text-background">
                    {t('generating')}
                  </Atoms.Typography>
                </Atoms.Container>
              ) : isExpired ? (
                <Atoms.Container className="items-center gap-2">
                  <Libs.QrCode className="h-8 w-8 text-muted-foreground" />
                  <Atoms.Typography as="small" size="sm" className="text-muted-foreground">
                    {t('expired')}
                  </Atoms.Typography>
                </Atoms.Container>
              ) : url ? (
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
              ) : (
                <Atoms.Container className="items-center gap-2">
                  <Libs.Loader2 className="h-8 w-8 animate-spin text-background" />
                  <Atoms.Typography as="small" size="sm" className="text-background">
                    {t('generating')}
                  </Atoms.Typography>
                </Atoms.Container>
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
            <Atoms.Button
              className="h-[60px] w-full rounded-full"
              size="lg"
              onClick={handleAuthorizeClick}
              disabled={isLoading || isExpired || !url}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span aria-live="polite">{t('generatingShort')}</span>
                </>
              ) : isExpired ? (
                <>
                  <Libs.QrCode className="mr-2 h-4 w-4" />
                  {t('expired')}
                </>
              ) : (
                <>
                  <Libs.Key className="mr-2 h-4 w-4" />
                  {t('authorize')}
                </>
              )}
            </Atoms.Button>
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>

      <Molecules.DialogAuthExpired open={isExpired} onRefresh={fetchUrl} isLoading={isLoading} />
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
