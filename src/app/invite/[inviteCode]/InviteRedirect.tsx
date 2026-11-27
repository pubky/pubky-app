'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { matchInviteRoute, ONBOARDING_ROUTES } from '@/app/routes';
import { formatInviteCode } from '@/libs/utils/utils';

/**
 * Sends `/invite/<code>` to the install step with the code applied. It runs in the browser and reads
 * the code from the URL path, so the static export, which prerenders this page once under a
 * placeholder code, redirects the same way a server does.
 */
export function InviteRedirect() {
  const router = useRouter();
  const inviteCode = matchInviteRoute(usePathname())?.inviteCode ?? '';

  useEffect(() => {
    const searchParams = new URLSearchParams();
    searchParams.set('inviteCode', formatInviteCode(inviteCode));
    router.replace(`${ONBOARDING_ROUTES.INSTALL}?${searchParams.toString()}`);
  }, [inviteCode, router]);

  return null;
}
