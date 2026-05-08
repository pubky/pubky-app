'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import { HeaderContainer, HeaderOnboarding, HeaderTitle } from '@/molecules/Header/Header';
import { HeaderHome } from '@/molecules/HeaderHome/HeaderHome';
import { HeaderJoin } from '@/molecules/HeaderJoin/HeaderJoin';
import { HeaderSignIn } from '@/molecules/HeaderSignIn/HeaderSignIn';
import { Logo } from '@/molecules/Logo/Logo';
import { useAuthStore } from '@/stores/auth/auth.store';
import { pathToStepConfig } from './Header.constants';

export function Header() {
  const pathname = usePathname();
  const t = useTranslations('onboarding.steps');
  const isAuthenticated = useAuthStore((state) => Boolean(state.currentUserPubky));
  const { isPublicRoute } = usePublicRoute();

  const isOnboarding = pathname?.startsWith('/onboarding') ?? false;
  const isCopyrightPage = pathname === '/copyright';
  const stepConfig = pathname ? pathToStepConfig[pathname] : undefined;
  const currentStep = stepConfig?.step ?? 1;
  const currentTitle = stepConfig?.titleKey ? t(stepConfig.titleKey) : undefined;

  // Hide header on mobile when:
  // - User is authenticated (not during onboarding) - they use MobileHeader
  // - User is on public route (post/profile) - they use MobileHeader with Join button
  const shouldHideHeaderOnMobile = (isAuthenticated && !isOnboarding) || isPublicRoute;
  // Show title only for onboarding/logout pages (when stepConfig exists) and user is not authenticated,
  // or during profile setup (step 5)
  const shouldShowTitle = currentTitle && (!isAuthenticated || currentStep === 5);

  // Onboarding or non-authenticated route
  const isOnboardingOrNonAuthenticatedRoute = isOnboarding || !isAuthenticated;
  // Add padding to the header container only on onboarding or non-authenticated routes
  const classNameNav = isOnboardingOrNonAuthenticatedRoute ? '' : ' xl:px-0';
  // Determine which header content to show:
  // - Onboarding: HeaderOnboarding
  // - Authenticated: HeaderSignIn (navigation + avatar)
  // - Unauthenticated on public route (post/profile): HeaderJoin (minimal, just join icon)
  // - Unauthenticated on landing/other: HeaderHome (social links + sign in)
  const renderHeaderContent = () => {
    if (isOnboarding) {
      return <HeaderOnboarding currentStep={currentStep} />;
    }
    if (isAuthenticated) {
      return <HeaderSignIn />;
    }
    if (isPublicRoute) {
      return <HeaderJoin />;
    }
    return <HeaderHome />;
  };

  // Copyright page shows only logo (minimal header).
  // Pass the same classNameNav as other routes so the logo doesn't shift
  // horizontally when navigating between the app and /copyright.
  if (isCopyrightPage) {
    return (
      <HeaderContainer classNameNav={classNameNav}>
        <Logo />
      </HeaderContainer>
    );
  }

  return (
    <HeaderContainer classNameNav={classNameNav} className={shouldHideHeaderOnMobile ? 'hidden lg:block' : undefined}>
      <Logo noLink={currentStep === 5} />
      {shouldShowTitle && <HeaderTitle currentTitle={currentTitle} />}
      {renderHeaderContent()}
    </HeaderContainer>
  );
}
