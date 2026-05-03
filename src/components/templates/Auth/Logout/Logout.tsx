'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ROOT_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { AuthController } from '@/controllers/auth/auth';
import { Logger } from '@/libs/logger/logger';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { ContentCard } from '@/molecules/Content/Content';
import { LogoutContent, LogoutNavigation } from '@/molecules/Logout/Logout';
import { PageTitle } from '@/molecules/Page/Page';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

type LogoutViewState = 'idle' | 'loading' | 'success' | 'error';

async function handleRouteLogout(setViewState: Dispatch<SetStateAction<LogoutViewState>>) {
  setViewState('loading');
  try {
    await AuthController.logout();
    setViewState('success');
  } catch (error) {
    Logger.error('Failed to logout from /logout route', { error });
    setViewState('error');
  } finally {
    useAuthStore.getState().setIsLoggingOut(false);
  }
}

export function Logout() {
  const router = useRouter();
  const t = useTranslations('logout');
  const onboardingHasHydrated = useOnboardingStore((state) => state.hasHydrated);
  const authHasHydrated = useAuthStore((state) => state.hasHydrated);
  const session = useAuthStore((state) => state.session);
  const sessionExport = useAuthStore((state) => state.sessionExport);
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const [viewState, setViewState] = useState<LogoutViewState>('idle');

  const isHydrated = onboardingHasHydrated && authHasHydrated;
  const isSignedOut = session === null && sessionExport === null;

  useEffect(() => {
    if (!isHydrated) return;

    if (viewState !== 'idle') return;

    if (isSignedOut) {
      useAuthStore.getState().setIsLoggingOut(false);
      setViewState('success');
      return;
    }

    if (isLoggingOut) {
      return;
    }

    void handleRouteLogout(setViewState);
  }, [isHydrated, isLoggingOut, isSignedOut, viewState]);

  const onHandleHome = () => {
    router.push(ROOT_ROUTES);
  };

  const onHandleRetry = () => {
    void handleRouteLogout(setViewState);
  };

  const renderLoadingState = () => (
    <Container size="container" className="mb-6">
      <PageHeader>
        <PageTitle size="large">{t('loadingTitle')}</PageTitle>
        <PageSubtitle>{t('loadingSubtitle')}</PageSubtitle>
      </PageHeader>
      <ContentCard layout="column">
        <Container className="items-center justify-center gap-4 py-10">
          <Spinner size="lg" />
        </Container>
      </ContentCard>
    </Container>
  );

  const renderErrorState = () => (
    <>
      <Container size="container" className="mb-6">
        <PageHeader>
          <PageTitle size="large">{t('errorTitle')}</PageTitle>
          <PageSubtitle>{t('errorSubtitle')}</PageSubtitle>
        </PageHeader>
      </Container>
      <div className="onboarding-nav mt-auto w-full lg:mt-0">
        <ButtonsNavigation
          id="logout-error-navigation"
          backText={t('homepage')}
          continueText={t('retry')}
          onHandleBackButton={onHandleHome}
          onHandleContinueButton={onHandleRetry}
        />
      </div>
    </>
  );

  const renderSuccessState = () => (
    <>
      <LogoutContent />
      <div className="onboarding-nav mt-auto w-full lg:mt-0">
        <LogoutNavigation />
      </div>
    </>
  );

  const shouldShowLoading = !isHydrated || viewState === 'loading' || (viewState === 'idle' && !isSignedOut);

  const content = shouldShowLoading
    ? renderLoadingState()
    : viewState === 'error'
      ? renderErrorState()
      : renderSuccessState();

  return (
    <Container size="container" className="h-screen-without-page-header-auth-pages gap-0 px-6">
      {content}
    </Container>
  );
}
