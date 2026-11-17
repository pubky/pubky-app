'use client';

import { useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getOnboardingScanRoute, type OnboardingKeychain } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL } from '@/config/externalLinks';
import { getDeployEnv } from '@/config/network';
import { Bitkit, PubkyIcon } from '@/icons';
import { isIosDevice } from '@/libs/pwa/platform';
import { DialogDownloadPubkyRing } from '@/organisms/DialogDownloadPubkyRing/DialogDownloadPubkyRing';
import { PageTitle } from '../Page/Page';

const noopSubscribe = () => () => {};
const getServerIsIos = () => false;

export const InstallHeader = () => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {'Pick your '}
        <span className="block text-brand md:inline">{'keychain.'}</span>
      </PageTitle>
      <PageSubtitle>{'Install a keychain for your identity keys.'}</PageSubtitle>
    </PageHeader>
  );
};

const BitkitStoreButtons = () => (
  <>
    <Link href={BITKIT_APP_STORE_URL} target="_blank">
      <Image src="/images/badge-apple.webp" alt="Download Bitkit on the App Store" width={120} height={40} />
    </Link>
    <Link href={BITKIT_PLAY_STORE_URL} target="_blank">
      <Image src="/images/badge-android.webp" alt="Get Bitkit on Google Play" width={135} height={40} />
    </Link>
  </>
);

const KEYCHAINS = {
  ring: {
    buttonId: 'continue-with-pubky-ring-btn',
    label: 'Continue with Pubky Ring',
    description: 'Pubky Ring is a mobile keychain that enables you to securely authorize web services and apps.',
    logo: (
      <Image
        src="/images/logo-pubky-ring.svg"
        alt="Pubky Ring"
        width={184}
        height={40}
        className="h-10 w-auto self-start"
      />
    ),
    icon: <PubkyIcon className="size-4 text-secondary-foreground [&_path]:fill-current" aria-hidden="true" />,
    storeButtons: (
      <>
        <DialogDownloadPubkyRing store="apple" />
        <DialogDownloadPubkyRing store="android" />
      </>
    ),
  },
  bitkit: {
    buttonId: 'continue-with-bitkit-btn',
    label: 'Continue with Bitkit',
    description:
      'Bitkit is a simple, yet powerful self‑custodial wallet, that also functions as keychain for the Pubky ecosystem.',
    logo: (
      <Image src="/images/bitkit-logo.svg" alt="Bitkit" width={138} height={40} className="h-10 w-auto self-start" />
    ),
    icon: <Bitkit className="size-4 translate-y-px" aria-hidden="true" />,
    storeButtons: <BitkitStoreButtons />,
  },
} satisfies Record<OnboardingKeychain, unknown>;

/**
 * The store badges install the production apps. On staging the Bitkit sign-up tap opens Bitkit's
 * regtest build (`to.bitkit.dev`, see `toAndroidAuthIntentUrl`), which no public store carries, so
 * staging shows no Bitkit badges rather than send testers to an app that cannot take the request.
 */
const showsStoreButtons = (keychain: OnboardingKeychain): boolean =>
  keychain === 'ring' || getDeployEnv() === 'production';

interface KeychainCardProps {
  keychain: OnboardingKeychain;
  pendingKeychain: OnboardingKeychain | null;
  onContinue: (keychain: OnboardingKeychain) => void;
}

const KeychainCard = ({ keychain, pendingKeychain, onContinue }: KeychainCardProps) => {
  const { buttonId, label, description, logo, icon, storeButtons } = KEYCHAINS[keychain];
  return (
    <Container className="flex-1 gap-6 rounded-md bg-card p-6 lg:p-12" data-testid={`install-keychain-${keychain}`}>
      {logo}
      <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground opacity-80">
        {description}
      </Typography>
      {showsStoreButtons(keychain) && (
        <Container className="flex-row flex-wrap items-center gap-4">{storeButtons}</Container>
      )}
      <Button
        id={buttonId}
        type="button"
        variant={ButtonVariant.SECONDARY}
        size="lg"
        className="h-15 w-full border-0 leading-5"
        onClick={() => onContinue(keychain)}
        disabled={pendingKeychain !== null}
      >
        {pendingKeychain === keychain ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
        {label}
      </Button>
    </Container>
  );
};

/**
 * The keychains a new pubky can be created with. Bitkit is left out on iOS: Bitkit iOS opens only
 * sign-in and setup links, so the phone's tap-to-authorize could not hand it the sign-up request.
 */
export const InstallKeychains = () => {
  const router = useRouter();
  const isIos = useSyncExternalStore(noopSubscribe, isIosDevice, getServerIsIos);
  const [pendingKeychain, setPendingKeychain] = useState<OnboardingKeychain | null>(null);
  const keychains: OnboardingKeychain[] = isIos ? ['ring'] : ['ring', 'bitkit'];

  const handleContinue = (keychain: OnboardingKeychain) => {
    setPendingKeychain(keychain);
    router.push(getOnboardingScanRoute(keychain));
  };

  return (
    <Container className="gap-6 lg:flex-row lg:items-stretch" data-testid="install-keychains">
      {keychains.map((keychain) => (
        <KeychainCard
          key={keychain}
          keychain={keychain}
          pendingKeychain={pendingKeychain}
          onContinue={handleContinue}
        />
      ))}
      <Container className="hidden flex-1 items-center justify-center rounded-md bg-card p-12 lg:flex">
        <Image
          src="/images/keyring.webp"
          alt="Lime Pubky keyring representing keys you control"
          width={192}
          height={192}
          className="size-48"
        />
      </Container>
    </Container>
  );
};
