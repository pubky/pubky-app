'use client';

import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
import { COPYRIGHT_ROUTES, ROOT_ROUTES } from '@/app/routes';
import { useIsHydrated } from '@/hooks/useIsHydrated/useIsHydrated';
import { HeaderContainer } from '@/molecules/Header/HeaderPublicContent';
import { HeaderHome } from '@/molecules/HeaderHome/HeaderHome';
import { Logo } from '@/molecules/Logo/Logo';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';

export function scrollLandingToTop(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
}

/** Public documents show only the logo until hydration and for members; the landing header offers sign-in immediately. */
export function PublicHeader() {
  const pathname = usePathname();
  const isLanding = pathname === ROOT_ROUTES;
  const hydrated = useIsHydrated();
  const hasMember = useAuthStore((state) => Boolean(selectDisplayUserPubky(state)));
  const showActions = isLanding || (pathname !== COPYRIGHT_ROUTES.COPYRIGHT && hydrated && !hasMember);

  return (
    <HeaderContainer>
      <Logo onClick={isLanding ? scrollLandingToTop : undefined} />
      {showActions && <HeaderHome />}
    </HeaderContainer>
  );
}
