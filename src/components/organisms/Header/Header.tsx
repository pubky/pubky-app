'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import { pathToStepConfig } from './Header.constants';

export function Header() {
  const pathname = usePathname();
  const t = useTranslations('onboarding.steps');
  const isAuthenticated = Core.useAuthStore((state) => Boolean(state.currentUserPubky));
  const { isPublicRoute } = Hooks.usePublicRoute();

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
  const classNameNav = isOnboardingOrNonAuthenticatedRoute ? 'p-6 sm:px-6' : 'lg:px-6 xl:px-0';
  // Determine which header content to show:
  // - Onboarding: HeaderOnboarding
  // - Authenticated: HeaderSignIn (navigation + avatar)
  // - Unauthenticated on public route (post/profile): HeaderJoin (minimal, just join icon)
  // - Unauthenticated on landing/other: HeaderHome (social links + sign in)
  const renderHeaderContent = () => {
    if (isOnboarding) {
      return <Molecules.HeaderOnboarding currentStep={currentStep} />;
    }
    if (isAuthenticated) {
      return <Molecules.HeaderSignIn />;
    }
    if (isPublicRoute) {
      return <Molecules.HeaderJoin />;
    }
    return <Molecules.HeaderHome />;
  };

  // Copyright page shows only logo (minimal header)
  if (isCopyrightPage) {
    return (
      <Molecules.HeaderContainer>
        <Molecules.Logo />
      </Molecules.HeaderContainer>
    );
  }

  return (
    <Molecules.HeaderContainer
      classNameNav={classNameNav}
      className={shouldHideHeaderOnMobile ? 'hidden lg:block' : undefined}
    >
      <Molecules.Logo noLink={currentStep === 5} />
      {shouldShowTitle && <Molecules.HeaderTitle currentTitle={currentTitle} />}
      {renderHeaderContent()}
    </Molecules.HeaderContainer>
  );
}
