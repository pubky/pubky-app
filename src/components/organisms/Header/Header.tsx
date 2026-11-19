'use client';

import { usePathname } from 'next/navigation';
import { AUTH_ROUTES, isPublicDocumentRoute, ONBOARDING_ROUTES, ROOT_ROUTES } from '@/app/routes';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { AuthStatus } from '@/hooks/useAuthStatus/useAuthStatus.types';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import { clearSocialMigrationSignedOutNotice } from '@/libs/social-migration/signed-out-notice';
import { cn } from '@/libs/utils/utils';
import { HeaderExploreNavigationButtons, HeaderOnboarding, HeaderTitle } from '@/molecules/Header/Header';
import { HeaderContainer } from '@/molecules/Header/HeaderPublicContent';
import { HeaderHome } from '@/molecules/HeaderHome/HeaderHome';
import { HeaderSignIn } from '@/molecules/HeaderSignIn/HeaderSignIn';
import { Logo } from '@/molecules/Logo/Logo';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { pathToStepConfig } from './Header.constants';
import { PublicHeader, scrollLandingToTop } from './PublicHeader';

export function Header() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => Boolean(selectDisplayUserPubky(state)));
  const { status } = useAuthStatus();
  const { isCoreExploreRoute, isDynamicPublicRoute } = usePublicRoute();

  const isOnboarding = pathname?.startsWith('/onboarding') ?? false;
  if (isPublicDocumentRoute(pathname) || (pathname === ROOT_ROUTES && !isAuthenticated)) return <PublicHeader />;
  const stepConfig = pathname ? pathToStepConfig[pathname] : undefined;
  const currentStep = stepConfig?.step ?? 1;
  const currentTitle = stepConfig?.title;
  // Onboarding steps reached after authentication (profile setup and the Experience screens): the
  // logo must not link away mid-flow. Step numbers are not unique in the 4-step model, so match on
  // the path instead.
  const isPostAuthOnboardingStep =
    pathname === ONBOARDING_ROUTES.PROFILE ||
    pathname === ONBOARDING_ROUTES.TAGS ||
    pathname === ONBOARDING_ROUTES.FOLLOW;

  // Hide header on mobile when:
  // - User is on a core explore route (/home, /hot, /search, /collections) — MobileHeader + MobileFooter
  // - Any user on a dynamic public route (/post/..., /profile/[pubky], /collections/[userId]/[postId]) — page shell owns mobile chrome
  // - Authenticated on standard app routes — MobileHeader + MobileFooter
  // Legal pages have no mobile app shell, so their header (and its way back) stays on every viewport.
  const shouldHideHeaderOnMobile = isCoreExploreRoute || isDynamicPublicRoute || (isAuthenticated && !isOnboarding);
  // Show the step title on every onboarding page regardless of auth state: the post-auth steps
  // (profile, experience) are reached while authenticated. Outside onboarding (i.e. /logout) the
  // title is only for signed-out users.
  const shouldShowTitle = currentTitle && (isOnboarding || !isAuthenticated);

  // Determine which header content to show:
  // - Onboarding: HeaderOnboarding
  // - Authenticated: HeaderSignIn (navigation + avatar)
  // - Unauthenticated on core explore or dynamic public routes (home/hot/search/collections/post/profile): explore navigation + join
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

  if (pathname === AUTH_ROUTES.MIGRATION) {
    // A signed-out visitor can leave the explanation. A held account still owes the migration.
    const leaveMigration = () => {
      if (status === AuthStatus.UNAUTHENTICATED) clearSocialMigrationSignedOutNotice();
    };
    return (
      <HeaderContainer>
        <Logo onClick={leaveMigration} />
      </HeaderContainer>
    );
  }

  return (
    <HeaderContainer className={cn(shouldHideHeaderOnMobile && 'hidden lg:block')}>
      <Logo noLink={isPostAuthOnboardingStep} onClick={pathname === ROOT_ROUTES ? scrollLandingToTop : undefined} />
      {shouldShowTitle && <HeaderTitle currentTitle={currentTitle} />}
      {renderHeaderContent()}
    </HeaderContainer>
  );
}
