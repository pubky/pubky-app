'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Config from '@/config';
import * as App from '@/app';

export const InstallCard = () => {
  const t = useTranslations('onboarding.install');
  return (
    <Molecules.ContentCard
      image={{
        src: '/images/keyring.webp',
        alt: 'Keyring',
        width: 192,
        height: 192,
      }}
    >
      <Atoms.Container className="gap-3">
        <Atoms.Container className="flex-col items-center sm:items-start">
          <Image
            src="/images/logo-pubky-ring-blue.svg"
            alt="Pubky Ring"
            className="w-[137px] sm:w-auto"
            width={220}
            height={48}
          />
        </Atoms.Container>
        <Atoms.Typography className="text-base font-medium text-secondary-foreground opacity-80">
          {t('instructions')}
        </Atoms.Typography>
      </Atoms.Container>
      <StoreButtons />
    </Molecules.ContentCard>
  );
};

export const InstallFooter = () => {
  const t = useTranslations('onboarding.install');
  return (
    <Atoms.FooterLinks className="py-6">
      {t.rich('alternative', {
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

export const InstallHeader = () => {
  const t = useTranslations('onboarding.install');
  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => (
            <>
              <br className="block sm:hidden" /> <span className="text-brand">{chunks}</span>
            </>
          ),
        })}
      </Molecules.PageTitle>
      <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
    </Atoms.PageHeader>
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
    router.push(App.ONBOARDING_ROUTES.PUBKY);
  };

  const handleContinue = () => {
    setLoadingContinue(true);
    router.push(App.ONBOARDING_ROUTES.SCAN);
  };

  return (
    <Atoms.Container className={Libs.cn('flex-col-reverse gap-3 md:flex-row lg:gap-6', props.className)}>
      <Atoms.Container className="flex-row items-center gap-1">
        <Atoms.Button
          id="create-keys-in-browser-btn"
          variant="outline"
          className="flex-1 rounded-full md:flex-none"
          onClick={handleCreate}
          disabled={loadingCreate || loadingContinue}
        >
          {loadingCreate ? (
            <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Libs.AppWindow className="mr-2 h-4 w-4" />
          )}
          {t('createInBrowser')}
        </Atoms.Button>
        <Molecules.PopoverTradeoffs />
      </Atoms.Container>
      <Atoms.Button
        id="continue-with-pubky-ring-btn"
        size="lg"
        className="rounded-full"
        onClick={handleContinue}
        disabled={loadingCreate || loadingContinue}
      >
        {loadingContinue ? (
          <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Libs.ArrowRight className="mr-2 h-4 w-4" />
        )}
        {t('continueWithRing')}
      </Atoms.Button>
    </Atoms.Container>
  );
};

export function StoreButtons({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Atoms.Container className={Libs.cn('flex-row justify-around gap-4 sm:justify-start', className)}>
      <Organisms.DialogDownloadPubkyRing store="apple" />
      <Organisms.DialogDownloadPubkyRing store="android" />
    </Atoms.Container>
  );
}
