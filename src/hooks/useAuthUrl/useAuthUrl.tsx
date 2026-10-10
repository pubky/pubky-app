'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AuthController } from '@/controllers/auth/auth';
import { isAuthApprovalMismatchError, isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { isAppError, isWrongEnvironmentHomeserverError } from '@/libs/error/error.utils';
import { copyToClipboard } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import type { UseAuthUrlOptions, UseAuthUrlReturn } from './useAuthUrl.types';

const reportedApprovalFailures = new WeakSet<object>();

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
          : type === 'upgrade'
            ? await AuthController.getUpgradeAuthUrl(fresh)
            : await AuthController.getAuthUrl(fresh);
      if (!flow) return;
      void flow.awaitApproval.catch((error: unknown) => {
        if (current()) {
          setUrl('');
          setIsExpired(true);
        }
        if (isAuthFlowCanceledError(error)) return;
        if (!current() && isAppError(error) && error.operation === 'awaitApproval') return;
        if (isAppError(error) && error.operation === 'awaitApproval' && error.code === TimeoutErrorCode.REQUEST_TIMEOUT)
          return;
        if (typeof error === 'object' && error !== null) {
          if (reportedApprovalFailures.has(error)) return;
          reportedApprovalFailures.add(error);
        }
        toast({
          variant: 'error',
          description: isWrongEnvironmentHomeserverError(error)
            ? 'This key is linked to a different homeserver. Use a staging account on this site.'
            : type === 'upgrade' || isAuthApprovalMismatchError(error)
              ? 'Authorization failed. Approve with the key you are signed in with.'
              : 'Authorization failed. Try again.',
        });
      });
      if (current()) setUrl(flow.authorizationUrl);
    } catch (error) {
      if (!current()) return;
      setIsExpired(true);
      if (isAuthFlowCanceledError(error)) return;
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
