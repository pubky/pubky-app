'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AuthController } from '@/controllers/auth/auth';
import { AUTH_FLOW_CANCELED_ERROR_NAME } from '@/libs/auth/cancellation';
import { isWrongEnvironmentHomeserverError } from '@/libs/error/error.utils';
import { copyToClipboard } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import type { UseAuthUrlOptions, UseAuthUrlReturn } from './useAuthUrl.types';

/** The controller owns approval/adoption so mobile handoff and Strict Mode cannot adopt twice. */
export function useAuthUrl(options: UseAuthUrlOptions = {}): UseAuthUrlReturn {
  const autoFetch = options.autoFetch ?? true;
  const type = options.type ?? 'signin';
  const inviteCode = options.type === 'signup' ? options.inviteCode : '';
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [isExpired, setIsExpired] = useState(false);
  const requestId = useRef(0);

  async function load(fresh: boolean): Promise<void> {
    const id = ++requestId.current;
    const current = () => id === requestId.current;
    setIsLoading(true);
    setIsExpired(false);
    setUrl('');
    try {
      const flow =
        type === 'signup'
          ? await AuthController.getSignupAuthUrl(inviteCode, fresh)
          : await AuthController.getAuthUrl(fresh);
      void flow.awaitApproval.catch((error: unknown) => {
        if (!current() || (error instanceof Error && error.name === AUTH_FLOW_CANCELED_ERROR_NAME)) return;
        setUrl('');
        setIsExpired(true);
        toast({
          variant: 'error',
          description: isWrongEnvironmentHomeserverError(error)
            ? 'This key is linked to a different homeserver. Use a staging account on this site.'
            : 'Authorization failed. Try again.',
        });
      });
      if (current()) setUrl(flow.authorizationUrl);
    } catch (error) {
      if (!current() || (error instanceof Error && error.name === AUTH_FLOW_CANCELED_ERROR_NAME)) return;
      setIsExpired(true);
      toast({ variant: 'error', description: 'Could not generate QR. Refresh and try again.' });
    } finally {
      if (current()) setIsLoading(false);
    }
  }

  const resume = useEffectEvent(() => {
    void load(false);
  });
  useEffect(() => {
    const subscriber = requestId;
    if (autoFetch) resume();
    // Keep controller polling alive during the Ring handoff. Only detach this UI subscriber.
    return () => {
      subscriber.current++;
    };
  }, [autoFetch, type, inviteCode]);

  return {
    url,
    isLoading,
    isExpired,
    fetchUrl: () => load(true),
    copyAuthUrl: async () => {
      if (url) await copyToClipboard({ text: url });
    },
  };
}
