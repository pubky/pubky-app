'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AUTH_ROUTES, ROOT_ROUTES } from '@/app/routes';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { ButtonsNavigation } from '../ButtonsNavigation/ButtonsNavigation';
import { PageTitle } from '../Page/Page';

export const LogoutContent = () => {
  return (
    <Container size="container" className="mb-6">
      <LogoutHeader />
      <Card data-testid="logout-image-card" className="w-full items-center justify-center rounded-md p-6 lg:p-12">
        <Image src="/images/tag.webp" alt="Pubky tag" width={192} height={192} className="size-48" priority />
      </Card>
    </Container>
  );
};

export const LogoutHeader = () => {
  const t = useTranslations('logout');

  return (
    <PageHeader>
      <PageTitle size="large">
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </PageTitle>
      <PageSubtitle>{t('subtitle')}</PageSubtitle>
    </PageHeader>
  );
};

export const LogoutNavigation = () => {
  const router = useRouter();
  const t = useTranslations('logout');

  const onHandleBackButton = () => {
    router.push(ROOT_ROUTES);
  };

  const onHandleContinueButton = () => {
    router.push(AUTH_ROUTES.SIGN_IN);
  };

  return (
    <ButtonsNavigation
      id="logout-navigation"
      backText={t('homepage')}
      continueText={t('signBackIn')}
      onHandleContinueButton={onHandleContinueButton}
      onHandleBackButton={onHandleBackButton}
    />
  );
};
