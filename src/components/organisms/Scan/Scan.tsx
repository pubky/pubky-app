'use client';

import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { ContentCard } from '@/molecules/Content/Content';
import { DialogAuthExpired } from '@/molecules/DialogAuthExpired/DialogAuthExpired';
import { PageTitle } from '@/molecules/Page/Page';

import { PUBKY_RING_URL, PUBKY_CORE_URL } from '@/config/externalLinks';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Loader2, QrCode, Key } from 'lucide-react';
import { Logger } from '@/libs/logger/logger';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
export const ScanContent = () => {
  const t = useTranslations('onboarding.scan');
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
        {isOpeningRing ? t('openingRing') : t('generatingShort')}
      </Typography>
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
  return (
    <>
      {/** Desktop view */}
      <Container size="container" className="hidden md:flex">
        <ScanHeader isMobile={false} />
        <ContentCard layout="column">
          <Container className="items-center justify-center gap-4">
            <div className="relative flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-foreground p-4">
              {isLoading || (!url && !isExpired) ? (
                <Container className="items-center gap-2">
                  <Loader2 className="size-8 animate-spin text-background" />
                  <Typography as="small" size="sm" className="text-background">
                    {t('generating')}
                  </Typography>
                </Container>
              ) : isExpired ? (
                <Container className="items-center gap-2">
                  <QrCode className="size-8 text-muted-foreground" />
                  <Typography as="small" size="sm" className="text-muted-foreground">
                    {t('expired')}
                  </Typography>
                </Container>
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
              <Typography as="p" className="text-lg font-semibold tracking-widest text-brand">
                {inviteCode}
              </Typography>
            )}
          </Container>
        </ContentCard>
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
              disabled={isMobileLaunching || isExpired || !url}
              aria-busy={isMobileLaunching}
              data-testid="button"
            >
              {mobileAuthorizeContent}
            </Button>
          </Container>
        </ContentCard>
      </Container>

      <DialogAuthExpired open={isExpired} onRefresh={fetchUrl} isLoading={isLoading} />
    </>
  );
};
export const ScanFooter = () => {
  const t = useTranslations('onboarding.scan');
  return (
    <FooterLinks className="py-6">
      {t.rich('authorizeSub', {
        pubkyRing: (chunks) => (
          <Link href={PUBKY_RING_URL} target="_blank">
            {chunks}
          </Link>
        ),
        pubkyCore: (chunks) => (
          <Link href={PUBKY_CORE_URL} target="_blank">
            {chunks}
          </Link>
        ),
      })}
    </FooterLinks>
  );
};
export const ScanHeader = ({ isMobile }: { isMobile: boolean }) => {
  const t = useTranslations('onboarding.scan');
  return (
    <PageHeader>
      <PageTitle size="large">
        {isMobile
          ? t.rich('titleMobile', {
              highlight: (chunks) => <span className="text-brand">{chunks}</span>,
            })
          : t.rich('titleDesktop', {
              highlight: (chunks) => <span className="text-brand">{chunks}</span>,
            })}
      </PageTitle>
      <PageSubtitle>{t('subtitle')}</PageSubtitle>
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
