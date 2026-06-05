'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import {
  HeaderContainer,
  HeaderExploreNavigationButtons,
  HeaderOnboarding,
  HeaderTitle,
} from '@/molecules/Header/Header';
import { HeaderHome } from '@/molecules/HeaderHome/HeaderHome';
import { HeaderSignIn } from '@/molecules/HeaderSignIn/HeaderSignIn';
import { Logo } from '@/molecules/Logo/Logo';
import { useAuthStore } from '@/stores/auth/auth.store';
import { pathToStepConfig } from './Header.constants';

export function Header() {
  const pathname = usePathname();
  const t = useTranslations('onboarding.steps');
  const isAuthenticated = useAuthStore((state) => Boolean(state.currentUserPubky));
  const { isCoreExploreRoute, isDynamicPublicRoute } = usePublicRoute();

  const isOnboarding = pathname?.startsWith('/onboarding') ?? false;
  const isCopyrightPage = pathname === '/copyright';
  const stepConfig = pathname ? pathToStepConfig[pathname] : undefined;
  const currentStep = stepConfig?.step ?? 1;
  const currentTitle = stepConfig?.titleKey ? t(stepConfig.titleKey) : undefined;

  // Hide header on mobile when:
  // - User is on a core explore route (/home, /hot, /search) — MobileHeader + MobileFooter
  // - Any user on a dynamic public route (/post/..., /profile/[pubky]) — page shell owns mobile chrome
  // - Authenticated on standard app routes — MobileHeader + MobileFooter
  const shouldHideHeaderOnMobile =
    isCoreExploreRoute || isDynamicPublicRoute || (isAuthenticated && !isOnboarding && !isDynamicPublicRoute);
  // Show title only for onboarding/logout pages (when stepConfig exists) and user is not authenticated,
  // or during profile setup (step 5)
  const shouldShowTitle = currentTitle && (!isAuthenticated || currentStep === 5);

  // App-shell layout: authenticated app pages and Explore mode (unauthenticated on a
  // public route, e.g. feed/post/profile) both render the feed + sidebars, so the header
  // must align with the content gutter. Onboarding and the landing page keep the default
  // centered padding instead.
  const isAppShellLayout = !isOnboarding && (isAuthenticated || isDynamicPublicRoute || isCoreExploreRoute);
  const classNameNav = isAppShellLayout ? ' xl:px-0' : '';
  // Determine which header content to show:
  // - Onboarding: HeaderOnboarding
  // - Authenticated: HeaderSignIn (navigation + avatar)
  // - Unauthenticated on core explore or dynamic public routes (home/hot/search/post/profile): explore navigation + join
  // - Unauthenticated on landing/other: HeaderHome (social links + sign in)
  const renderHeaderContent = () => {
    if (isOnboarding) {
      return <HeaderOnboarding currentStep={currentStep} />;
    }
    if (isAuthenticated) {
      return <HeaderSignIn />;
    }
    if (isCoreExploreRoute || isDynamicPublicRoute) {
      return <HeaderExploreNavigationButtons />;
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
