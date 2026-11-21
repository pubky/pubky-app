'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { LocksController } from '@/controllers/locks/locks';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import type { TPaykitSetupStatus } from '@/services/locks/locks.types';
import { isLocksAuthenticated } from '@/stores/locksAuth/locksAuth.selectors';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type {
  LocksSettingsStatus,
  UseLocksSettingsStatusOptions,
  UseLocksSettingsStatusReturn,
} from './useLocksSettingsStatus.types';

type PaykitAnswer = { session: LocksSdkSession; status: Exclude<LocksSettingsStatus, 'loading'> };

const PAYKIT_STATUS_TO_SETTINGS = {
  ready: 'set-up',
  setup_required: 'not-set-up',
  unavailable: 'unavailable',
} as const satisfies Record<TPaykitSetupStatus, PaykitAnswer['status']>;

/** The Locks settings page's setup state; docs/locks.md, "Locks settings page". */
export function useLocksSettingsStatus({
  paused = false,
}: UseLocksSettingsStatusOptions = {}): UseLocksSettingsStatusReturn {
  const hasHydrated = useLocksAuthStore((state) => state.hasHydrated);
  const session = useLocksAuthStore((state) => state.session);
  const secret = useLocksAuthStore((state) => state.locksSessionSecret);
  const paykitConnected = useLocksAuthStore((state) => state.paykitConnected);
  const needsSessionUpgrade = useSessionNeedsUpgrade();
  const [answer, setAnswer] = useState<PaykitAnswer | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  // Bumped when a setup dialog opens or finishes: a check sent before then must not touch its result.
  const answerGeneration = useRef(0);
  const canCheck = isLocksAuthenticated(session) && !needsSessionUpgrade;

  const recheck = () => {
    setAnswer(null);
    setCheckCount((count) => count + 1);
  };

  const markSetUp = () => {
    answerGeneration.current += 1;
    if (session) setAnswer({ session, status: 'set-up' });
  };

  // TODO:[Locks] pubky/locks#114 — also ask whether the Lock Server's grant is still live; today the
  // Lock Server answers from its cached session, so a revoke in Pubky Ring is not seen.
  useEffect(() => {
    if (!session || needsSessionUpgrade) return;
    let isCurrent = true;
    const generation = answerGeneration.current;
    void (async () => {
      let next: PaykitAnswer['status'] = 'error';
      try {
        next = PAYKIT_STATUS_TO_SETTINGS[await LocksController.fetchPaykitSetupStatus('BTC')];
      } catch {
        // Already reported by the Err factory.
      }
      if (!isCurrent || generation !== answerGeneration.current) return;
      if (next === 'set-up') LocksController.markPaykitConnected();
      setAnswer({ session, status: next });
    })();
    return () => {
      isCurrent = false;
    };
  }, [session, needsSessionUpgrade, checkCount]);

  // "Cancel" or Esc on "Locks Enabled" closes the dialog without `onSuccess`, yet the setup is done.
  useEffect(() => {
    if (!paused) return;
    answerGeneration.current += 1;
    return () => {
      const { session: current, paykitConnected: connected } = useLocksAuthStore.getState();
      if (!current || !connected) return;
      answerGeneration.current += 1;
      setAnswer({ session: current, status: 'set-up' });
    };
  }, [paused]);

  // Quiet: the last answer stays on screen. Not window `focus`, which leaving a dialog's iframe also fires.
  useEffect(() => {
    if (paused) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setCheckCount((count) => count + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [paused]);

  const getStatus = (): LocksSettingsStatus => {
    // A persisted secret without a live session is still being restored.
    if (!hasHydrated || (secret !== null && !session)) return 'loading';
    if (!canCheck) return 'not-set-up';
    if (answer?.session === session) return answer.status;
    return paykitConnected ? 'set-up' : 'loading';
  };

  return { status: getStatus(), recheck, markSetUp };
}
