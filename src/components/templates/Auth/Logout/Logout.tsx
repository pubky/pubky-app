'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as App from '@/app';
import { Logger } from '@/libs/logger/logger';
import { AuthController } from '@/controllers/auth/auth';
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
    router.push(App.ROOT_ROUTES);
  };

  const onHandleRetry = () => {
    void handleRouteLogout(setViewState);
  };

  const renderLoadingState = () => (
    <Atoms.Container size="container" className="mb-6">
      <Atoms.PageHeader>
        <Molecules.PageTitle size="large">{t('loadingTitle')}</Molecules.PageTitle>
        <Atoms.PageSubtitle>{t('loadingSubtitle')}</Atoms.PageSubtitle>
      </Atoms.PageHeader>
      <Molecules.ContentCard layout="column">
        <Atoms.Container className="items-center justify-center gap-4 py-10">
          <Atoms.Spinner size="lg" />
        </Atoms.Container>
      </Molecules.ContentCard>
    </Atoms.Container>
  );

  const renderErrorState = () => (
    <>
      <Atoms.Container size="container" className="mb-6">
        <Atoms.PageHeader>
          <Molecules.PageTitle size="large">{t('errorTitle')}</Molecules.PageTitle>
          <Atoms.PageSubtitle>{t('errorSubtitle')}</Atoms.PageSubtitle>
        </Atoms.PageHeader>
      </Atoms.Container>
      <div className="onboarding-nav mt-auto w-full lg:mt-0">
        <Molecules.ButtonsNavigation
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
      <Molecules.LogoutContent />
      <div className="onboarding-nav mt-auto w-full lg:mt-0">
        <Molecules.LogoutNavigation />
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
    <Atoms.Container size="container" className="h-screen-without-page-header-auth-pages gap-0 px-6">
      {content}
    </Atoms.Container>
  );
}
