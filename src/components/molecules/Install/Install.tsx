'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AppWindow, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { PUBKY_CORE_URL, PUBKY_RING_URL } from '@/config/externalLinks';
import { cn } from '@/libs/utils/utils';
import { DialogDownloadPubkyRing } from '@/organisms/DialogDownloadPubkyRing/DialogDownloadPubkyRing';
import { ContentCard } from '../Content/Content';
import { PageTitle } from '../Page/Page';
import { PopoverTradeoffs } from '../PopoverTradeoffs/PopoverTradeoffs';

export const InstallCard = () => {
  const t = useTranslations('onboarding.install');
  return (
    <ContentCard
      image={{
        src: '/images/keyring.webp',
        alt: 'Keyring',
        width: 192,
        height: 192,
      }}
    >
      <Container className="gap-3">
        <Container className="flex-col items-center sm:items-start">
          <Image
            src="/images/logo-pubky-ring.svg"
            alt="Pubky Ring"
            className="w-[137px] sm:w-auto"
            width={220}
            height={48}
          />
        </Container>
        <Typography className="text-base font-medium text-secondary-foreground opacity-80">
          {t('instructions')}
        </Typography>
      </Container>
      <StoreButtons />
    </ContentCard>
  );
};
export const InstallFooter = () => {
  const t = useTranslations('onboarding.install');
  return (
    <FooterLinks className="py-6">
      {t.rich('alternative', {
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
export const InstallHeader = () => {
  const t = useTranslations('onboarding.install');
  return (
    <PageHeader>
      <PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => (
            <>
              <br className="block sm:hidden" /> <span className="text-brand">{chunks}</span>
            </>
          ),
        })}
      </PageTitle>
      <PageSubtitle>{t('subtitle')}</PageSubtitle>
    </PageHeader>
  );
};
export const InstallNavigation = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const t = useTranslations('onboarding.install');
  const router = useRouter();
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const handleCreate = () => {
    // Reset any existing keypair to ensure a fresh one is generated
    setLoadingCreate(true);
    router.push(ONBOARDING_ROUTES.PUBKY);
  };
  const handleContinue = () => {
    setLoadingContinue(true);
    router.push(ONBOARDING_ROUTES.SCAN);
  };
  return (
    <Container className={cn('flex-col-reverse gap-3 md:flex-row lg:gap-6', props.className)}>
      <Container className="flex-row items-center gap-1">
        <Button
          id="create-keys-in-browser-btn"
          variant="outline"
          className="flex-1 rounded-full md:flex-none"
          onClick={handleCreate}
          disabled={loadingCreate || loadingContinue}
        >
          {loadingCreate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AppWindow className="mr-2 h-4 w-4" />}
          {t('createInBrowser')}
        </Button>
        <PopoverTradeoffs />
      </Container>
      <Button
        id="continue-with-pubky-ring-btn"
        size="lg"
        className="rounded-full"
        onClick={handleContinue}
        disabled={loadingCreate || loadingContinue}
      >
        {loadingContinue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
        {t('continueWithRing')}
      </Button>
    </Container>
  );
};
export function StoreButtons({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Container className={cn('flex-row justify-around gap-4 sm:justify-start', className)}>
      <DialogDownloadPubkyRing store="apple" />
      <DialogDownloadPubkyRing store="android" />
    </Container>
  );
}
