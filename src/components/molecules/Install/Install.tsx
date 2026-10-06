'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AppWindow, ArrowRight, Loader2 } from 'lucide-react';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { getPubkyCoreLink, getPubkyRingLink } from '@/config/externalLinks';
import { cn } from '@/libs/utils/utils';
import { DialogDownloadPubkyRing } from '@/organisms/DialogDownloadPubkyRing/DialogDownloadPubkyRing';
import { ContentCard } from '../Content/Content';
import { PageTitle } from '../Page/Page';
import { PopoverTradeoffs } from '../PopoverTradeoffs/PopoverTradeoffs';

export const InstallCard = () => {
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
          {'Download and install the mobile app. Then continue to the next step.'}
        </Typography>
      </Container>
      <StoreButtons />
    </ContentCard>
  );
};
export const InstallFooter = () => {
  return (
    <FooterLinks className="py-6">
      {'Use '}
      <Link href={getPubkyRingLink()} target="_blank">
        {'Pubky Ring'}
      </Link>
      {' or any other '}
      <Link href={getPubkyCoreLink()} target="_blank">
        {'Pubky Core'}
      </Link>
      {'–powered keychain, or create your keys in the browser (less secure).'}
    </FooterLinks>
  );
};
export const InstallHeader = () => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {'Install '}
        <br className="block sm:hidden" /> <span className="text-brand">{'Pubky Ring.'}</span>
      </PageTitle>
      <PageSubtitle>{'Pubky Ring is a keychain for your identity keys in the Pubky ecosystem.'}</PageSubtitle>
    </PageHeader>
  );
};
export const InstallNavigation = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
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
          {'Create keys in browser'}
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
        {'Continue with Pubky Ring'}
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
