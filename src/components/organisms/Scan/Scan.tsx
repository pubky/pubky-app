'use client';

import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Config from '@/config';
import * as App from '@/app';
import * as Hooks from '@/hooks';
import * as Core from '@/core';

export const ScanContent = () => {
  const t = useTranslations('onboarding.scan');
  const router = useRouter();
  const inviteCode = Core.useOnboardingStore((state) => state.inviteCode);
  const hasInviteCode = inviteCode.trim().length > 0;

  useEffect(() => {
    if (!hasInviteCode) {
      Libs.Logger.warn('[Scan] Missing inviteCode on signup screen; redirecting to invite flow');
      router.replace(App.ONBOARDING_ROUTES.HUMAN);
    }
  }, [hasInviteCode, router]);

  const { url, isLoading, isExpired, fetchUrl, copyAuthUrl } = Hooks.useAuthUrl(
    hasInviteCode ? { type: 'signup', inviteCode } : { autoFetch: false },
  );

  const [isOpeningRing, setIsOpeningRing] = useState(false);

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const fallbackUrl = isIOS ? Config.APP_STORE_URL : Config.PLAY_STORE_URL;

  if (!hasInviteCode) return null;

  const handleMobileAuth = async () => {
    if (isLoading || isExpired) return;

    if (!url) {
      void fetchUrl();
      return;
    }

    setIsOpeningRing(true);
    await copyAuthUrl();

    try {
      window.location.href = url;
    } catch (error) {
      Libs.Logger.error('Failed to open Pubky Ring deeplink:', error);
      Molecules.toast({
        title: t('linkFailed'),
        description: t('tryAgain'),
      });
      window.location.href = fallbackUrl;
    }
  };

  const isMobileLaunching = isLoading || isOpeningRing;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {isOpeningRing ? t('openingRing') : t('generatingShort')}
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
  );

  return (
    <>
      {/** Desktop view */}
      <Atoms.Container size="container" className="hidden md:flex">
        <ScanHeader isMobile={false} />
        <Molecules.ContentCard layout="column">
          <Atoms.Container className="items-center justify-center gap-4">
            <div className="relative flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-foreground p-4">
              {isLoading || (!url && !isExpired) ? (
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
            </div>
            {inviteCode && (
              <Atoms.Typography as="p" className="text-lg font-semibold tracking-widest text-brand">
                {inviteCode}
              </Atoms.Typography>
            )}
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>

      {/** Mobile view */}
      <Atoms.Container size="container" className="md:hidden">
        <ScanHeader isMobile={true} />
        <Molecules.ContentCard layout="column">
          <Atoms.Container className="flex-col items-center justify-center gap-12 lg:flex-row">
            <Image src="/images/logo-pubky-ring.svg" alt="Pubky Ring" width={137} height={30} />
            <Atoms.Button
              className="h-[60px] w-full rounded-full"
              size="lg"
              onClick={handleMobileAuth}
              disabled={isMobileLaunching || isExpired || !url}
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

export const ScanFooter = () => {
  const t = useTranslations('onboarding.scan');
  return (
    <Atoms.FooterLinks className="py-6">
      {t.rich('authorizeSub', {
        pubkyRing: (chunks) => (
          <Atoms.Link href={Config.PUBKY_RING_URL} target="_blank">
            {chunks}
          </Atoms.Link>
        ),
        pubkyCore: (chunks) => (
          <Atoms.Link href={Config.PUBKY_CORE_URL} target="_blank">
            {chunks}
          </Atoms.Link>
        ),
      })}
    </Atoms.FooterLinks>
  );
};

export const ScanHeader = ({ isMobile }: { isMobile: boolean }) => {
  const t = useTranslations('onboarding.scan');
  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        {isMobile
          ? t.rich('titleMobile', {
              highlight: (chunks) => <span className="text-brand">{chunks}</span>,
            })
          : t.rich('titleDesktop', {
              highlight: (chunks) => <span className="text-brand">{chunks}</span>,
            })}
      </Molecules.PageTitle>
      <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
    </Atoms.PageHeader>
  );
};

export const ScanNavigation = () => {
  const router = useRouter();

  const onHandleBackButton = () => {
    router.push(App.ONBOARDING_ROUTES.INSTALL);
  };

  return (
    <Molecules.ButtonsNavigation
      continueButtonDisabled={true}
      hiddenContinueButton={true}
      onHandleBackButton={onHandleBackButton}
    />
  );
};
