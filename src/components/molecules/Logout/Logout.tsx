'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as App from '@/app';

export const LogoutContent = () => {
  return (
    <Atoms.Container size="container" className="mb-6">
      <LogoutHeader />
      <Molecules.ContentCard layout="column">
        <Atoms.Container className="items-center justify-center">
          <Image src="/images/tag.webp" alt="Pubky Ring" width={192} height={192} />
        </Atoms.Container>
      </Molecules.ContentCard>
    </Atoms.Container>
  );
};

export const LogoutHeader = () => {
  const t = useTranslations('logout');

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

export const LogoutNavigation = () => {
  const router = useRouter();
  const t = useTranslations('logout');

  const onHandleBackButton = () => {
    router.push(App.ROOT_ROUTES);
  };

  const onHandleContinueButton = () => {
    router.push(App.AUTH_ROUTES.SIGN_IN);
  };

  return (
    <Molecules.ButtonsNavigation
      id="logout-navigation"
      backText={t('homepage')}
      continueText={t('signBackIn')}
      onHandleContinueButton={onHandleContinueButton}
      onHandleBackButton={onHandleBackButton}
    />
  );
};
