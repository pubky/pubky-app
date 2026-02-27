'use client';

import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
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
  const inviteCode = Core.useOnboardingStore((state) => state.inviteCode);
  const { url, isLoading, isOpeningRing, onAuthorizeClick } = Hooks.useMobileAuth({
    type: 'signup',
    inviteCode,
  });

  const isMobileLaunching = isLoading || isOpeningRing;
  const mobileAuthorizeContent = isMobileLaunching ? (
    <>
      <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {isOpeningRing ? t('openingRing') : t('generatingShort')}
    </>
  ) : (
    <>
      <Libs.Key className="mr-2 h-4 w-4" />
      {t('authorize')}
    </>
  );
  const mobileAuthorizeButton =
    isMobileLaunching || !url ? (
      <Atoms.Button className="h-[60px] w-full rounded-full" size="lg" disabled>
        {mobileAuthorizeContent}
      </Atoms.Button>
    ) : (
      <Atoms.Button className="h-[60px] w-full rounded-full" size="lg" onClick={onAuthorizeClick} data-testid="button">
        {mobileAuthorizeContent}
      </Atoms.Button>
    );

  return (
    <>
      {/** Desktop view */}
      <Atoms.Container size="container" className="hidden md:flex">
        <ScanHeader isMobile={false} />
        <Molecules.ContentCard layout="column">
          <Atoms.Container className="items-center justify-center gap-4">
            <div className="relative flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-foreground p-4">
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
            {mobileAuthorizeButton}
          </Atoms.Container>
        </Molecules.ContentCard>
      </Atoms.Container>
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
