'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Network } from '@beignet/wallet-core';
import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import type { WalletKeyConsumer } from '@/services/homeserver/wallet-identity';
import type { RingDeviceStatus } from '@/services/wallet/ring-enrollment';
import { WalletKeyApproval } from './WalletKeyApproval';
import { WalletPanel } from './WalletPanel';

export type DeviceAction = 'offer' | 'take' | 'keep' | 'elsewhere';

const copy = {
  offer: {
    title: 'Move to another device',
    description:
      'Your wallet is paused on this device. Approve in Ring to share the encrypted transfer with your other device.',
    button: 'Prepare transfer',
    working: 'Saving your wallet to your homeserver…',
  },
  take: {
    title: 'Your wallet is ready to move',
    description:
      'Approve in Ring to bring your balance, Lightning channels and Activity to this browser. Your previous device will stay locked.',
    button: 'Use wallet on this device',
    working: 'Restoring and verifying your wallet…',
  },
  keep: {
    title: 'Continue on your other device',
    description:
      'Open Wallet there and choose “Use wallet on this device”. To cancel the move, approve keeping the wallet here in Ring.',
    button: 'Keep wallet here',
    working: 'Checking device ownership…',
  },
  elsewhere: {
    title: 'Your wallet is on another device',
    description:
      'Open Wallet on the device you last used. Under the key icon, choose “Move to another device”, then approve in Ring. This screen checks for the transfer automatically.',
    button: 'Check for transfer',
    working: '',
  },
};

export function WalletDeviceSwitch({
  account,
  network,
  action,
  onApprove,
  onRefresh,
  onRecover,
  onClose,
  progress,
}: {
  account: string;
  network: Network;
  action: DeviceAction;
  progress?: number;
  onApprove: WalletKeyConsumer;
  onRefresh: (signal: AbortSignal) => Promise<RingDeviceStatus['state'] | undefined>;
  onRecover?: () => void;
  onClose: () => void;
}) {
  const [approving, setApproving] = useState(action === 'offer');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const manualCheck = useRef<() => void>(null);
  const refresh = useEffectEvent((signal: AbortSignal) => onRefresh(signal));
  useEffect(() => {
    if (action !== 'elsewhere') return;
    const controller = new AbortController();
    const { signal } = controller;
    const interval = 5000;
    let delay = interval;
    let timer: number | undefined;
    let pending = false;
    function schedule() {
      window.clearTimeout(timer);
      if (!signal.aborted && !document.hidden) timer = window.setTimeout(() => void check(), delay);
    }
    async function check() {
      if (pending || document.hidden || signal.aborted) return;
      window.clearTimeout(timer);
      pending = true;
      setChecking(true);
      try {
        const state = await refresh(signal);
        if (!signal.aborted) setMessage(state === 'other-device' ? 'Still waiting for your other device.' : '');
        delay = interval;
      } catch {
        if (!signal.aborted) setMessage('Could not check your homeserver. Trying again…');
        delay = Math.min(30_000, delay * 2);
      } finally {
        pending = false;
        if (!signal.aborted) {
          setChecking(false);
          schedule();
        }
      }
    }
    function visibilityChanged() {
      if (document.hidden) window.clearTimeout(timer);
      else void check();
    }
    manualCheck.current = () => void check();
    document.addEventListener('visibilitychange', visibilityChanged);
    schedule();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibilityChanged);
      manualCheck.current = null;
    };
  }, [account, network, action]);
  const content = copy[action];
  if (approving && action !== 'elsewhere') {
    return (
      <WalletKeyApproval
        account={account}
        network={network}
        title={content.title}
        description={content.description}
        workingLabel={content.working}
        progress={progress}
        onKey={onApprove}
        onCancel={action === 'offer' ? onClose : () => setApproving(false)}
      />
    );
  }
  return (
    <WalletPanel title={content.title} icon={ArrowRightLeft}>
      <p className="text-sm text-muted-foreground">{content.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="brand"
          disabled={checking}
          onClick={() => (action === 'elsewhere' ? manualCheck.current?.() : setApproving(true))}
        >
          {checking ? 'Checking…' : content.button} <ArrowRight aria-hidden />
        </Button>
        {onRecover && action === 'elsewhere' && (
          <Button type="button" variant="outline" onClick={onRecover}>
            I lost access to that device
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          Lock wallet
        </Button>
      </div>
      {action === 'elsewhere' && message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </WalletPanel>
  );
}
