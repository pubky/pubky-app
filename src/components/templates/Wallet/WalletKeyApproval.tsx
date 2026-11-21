'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Network } from '@beignet/wallet-core';
import { KeyRound } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { toAndroidAuthIntentUrl } from '@/libs/deeplink/deeplink';
import { isAndroidIntentDevice } from '@/libs/pwa/platform';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import {
  startWalletKeyApproval,
  WalletKeyApprovalError,
  type WalletKeyConsumer,
} from '@/services/homeserver/wallet-identity';
import { RingEnrollmentError } from '@/services/wallet/ring-enrollment';
import { WalletPanel } from './WalletPanel';

export function WalletKeyApproval({
  account,
  network,
  onKey,
  onCancel,
  title = 'Approve wallet access',
  description,
  workingLabel = 'Preparing your wallet…',
  progress,
  localDeviceId,
}: {
  account: string;
  network: Network;
  onKey: WalletKeyConsumer;
  onCancel: () => void;
  title?: string;
  description?: string;
  workingLabel?: string;
  progress?: number;
  localDeviceId?: string;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const live = useRef<AbortController | null>(null);
  const onKeyRef = useRef(onKey);
  useLayoutEffect(() => {
    onKeyRef.current = onKey;
  }, [onKey]);
  useLayoutEffect(() => () => live.current?.abort(), [account, network, attempt, localDeviceId]);
  useEffect(() => {
    const controller = new AbortController();
    live.current = controller;
    setError('');
    setUrl('');
    setWorking(false);
    function failed(reason: unknown) {
      if (controller.signal.aborted) return;
      setUrl('');
      setWorking(false);
      setError(
        reason instanceof WalletKeyApprovalError || reason instanceof RingEnrollmentError
          ? reason.message
          : 'Wallet approval could not finish. Try again with a Ring version that supports encryption-key approval.',
      );
    }
    try {
      const approval = startWalletKeyApproval(
        account,
        network,
        controller.signal,
        async (key, assertCurrent) => {
          assertCurrent();
          setUrl('');
          setWorking(true);
          try {
            await onKeyRef.current(key, assertCurrent);
          } catch (failure) {
            if (failure instanceof WalletKeyApprovalError || failure instanceof RingEnrollmentError) throw failure;
            throw new WalletKeyApprovalError(
              'The wallet could not finish setup after Ring approval. Return to the wallet and try again.',
            );
          }
        },
        localDeviceId,
      );
      setUrl(approval.authorizationUrl);
      void approval.result.catch(failed);
    } catch (reason) {
      failed(reason);
    }
    return () => {
      controller.abort();
      live.current = null;
    };
  }, [account, network, attempt, localDeviceId]);
  return (
    <div className="sentry-block" data-sentry-block>
      <WalletPanel title={title} icon={KeyRound}>
        <p className="text-sm text-muted-foreground">
          {description ??
            `Approve the ${network} wallet key with your signed-in identity in Pubky Ring. This gives this browser the key that controls your wallet. Approve only a request you started.`}
        </p>
        {url && (
          <>
            <div className="relative hidden size-48 items-center justify-center rounded-md bg-white p-2 pointer-fine:flex">
              <QrCodeSlot
                isLoading={false}
                isExpired={false}
                url={url}
                generatingLabel="Preparing approval"
                clickToReloadLabel="Refresh approval"
              />
            </div>
            <Button
              type="button"
              variant="brand"
              className="self-start pointer-fine:hidden"
              onClick={() => {
                window.location.href = isAndroidIntentDevice() ? toAndroidAuthIntentUrl(url, 'ring') : url;
              }}
            >
              Open Pubky Ring
            </Button>
            <p className="text-sm text-muted-foreground" role="status">
              Waiting for Ring approval…
            </p>
          </>
        )}
        {!url && !error && <p role="status">{working ? workingLabel : 'Preparing your wallet…'}</p>}
        {working && progress !== undefined && (
          <progress aria-label="Wallet transfer" className="h-1 w-full accent-brand" max={100} value={progress} />
        )}
        {error && (
          <>
            <p role="alert">{error}</p>
            <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={working}
          onClick={() => {
            live.current?.abort();
            onCancel();
          }}
        >
          Cancel
        </Button>
      </WalletPanel>
    </div>
  );
}
