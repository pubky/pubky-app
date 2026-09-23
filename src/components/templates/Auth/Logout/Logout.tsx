'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROOT_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { PAGE_GUTTER_CLASS } from '@/config/layoutClasses';
import { AuthController } from '@/controllers/auth/auth';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { ContentCard } from '@/molecules/Content/Content';
import { LogoutContent, LogoutNavigation } from '@/molecules/Logout/Logout';
import { PageTitle } from '@/molecules/Page/Page';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

type LogoutViewState = 'idle' | 'loading' | 'success' | 'error';

// The `.onboarding-nav` wrapper already supplies the bottom inset on mobile (1.5rem, or the
// safe-area inset when larger), and drops to 0 at `lg`. The nav itself therefore only needs its
// own bottom padding from `lg` up, otherwise the two insets stack and push the page into scroll.
const LOGOUT_NAV_CLASSNAME = 'pb-0 lg:pb-6';

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
    <Container size="container">
      <PageHeader>
        <PageTitle size="large">{'Signing you out...'}</PageTitle>
        <PageSubtitle>{"We're ending your session securely."}</PageSubtitle>
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
      <Container size="container">
        <PageHeader>
          <PageTitle size="large">{"We couldn't sign you out yet"}</PageTitle>
          <PageSubtitle>{'Please try again to finish signing out securely.'}</PageSubtitle>
        </PageHeader>
      </Container>
      <div className="onboarding-nav mt-auto w-full lg:mt-0">
        <ButtonsNavigation
          id="logout-error-navigation"
          className={LOGOUT_NAV_CLASSNAME}
          backText={'Homepage'}
          continueText={'Retry'}
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
        <LogoutNavigation className={LOGOUT_NAV_CLASSNAME} />
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
    <Container size="container" className={cn('h-screen-without-page-header-auth-pages gap-0', PAGE_GUTTER_CLASS)}>
      {content}
    </Container>
  );
}
