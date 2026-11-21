'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { Network } from '@beignet/wallet-core';
import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import type { WalletKeyConsumer } from '@/services/homeserver/wallet-identity';
import { WalletKeyApproval } from './WalletKeyApproval';
import { WalletPanel } from './WalletPanel';

export type DeviceAction = 'offer' | 'take' | 'keep' | 'elsewhere';

const copy = {
  offer: {
    title: 'Move to another device',
    description: 'Approve in Ring to pause payments here and save an encrypted copy for your other device.',
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
      'Open Wallet on the device you last used. Under the key icon, choose “Move to another device”, then check here.',
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
  onRefresh: () => Promise<void>;
  onRecover?: () => void;
  onClose: () => void;
}) {
  const [approving, setApproving] = useState(action === 'offer');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const checkOnReturn = useEffectEvent(() => {
    if (!document.hidden && !checking) void onRefresh().catch(() => {});
  });
  useEffect(() => {
    if (action !== 'elsewhere') return;
    const returned = () => checkOnReturn();
    document.addEventListener('visibilitychange', returned);
    return () => document.removeEventListener('visibilitychange', returned);
  }, [action]);
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
  async function check() {
    setChecking(true);
    setMessage('');
    try {
      await onRefresh();
      setMessage('Still waiting for your other device.');
    } catch {
      setMessage('Could not check your homeserver. Try again.');
    } finally {
      setChecking(false);
    }
  }
  return (
    <WalletPanel title={content.title} icon={ArrowRightLeft}>
      <p className="text-sm text-muted-foreground">{content.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="brand"
          disabled={checking}
          onClick={() => (action === 'elsewhere' ? void check() : setApproving(true))}
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
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </WalletPanel>
  );
}
