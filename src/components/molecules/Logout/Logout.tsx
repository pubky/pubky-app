'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
  return (
    <PageHeader>
      <PageTitle size="large">
        {'See you '}
        <span className="text-brand">{'soon!'}</span>
      </PageTitle>
      <PageSubtitle>{'You have securely signed out.'}</PageSubtitle>
    </PageHeader>
  );
};

export const LogoutNavigation = () => {
  const router = useRouter();
  const onHandleBackButton = () => {
    router.push(ROOT_ROUTES);
  };

  const onHandleContinueButton = () => {
    router.push(AUTH_ROUTES.SIGN_IN);
  };

  return (
    <ButtonsNavigation
      id="logout-navigation"
      backText={'Homepage'}
      continueText={'Sign back in'}
      onHandleContinueButton={onHandleContinueButton}
      onHandleBackButton={onHandleBackButton}
    />
  );
};
