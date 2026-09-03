'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_ROUTES } from '@/app/routes';
import type { UseSignOutResult } from './useSignOut.types';

export function useSignOut(): UseSignOutResult {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = () => {
    // The logout route performs session and local-state cleanup after this
    // settings page has unmounted.
    setIsLoading(true);
    router.push(AUTH_ROUTES.LOGOUT);
  };

  return {
    handleSignOut,
    isLoading,
  };
}
