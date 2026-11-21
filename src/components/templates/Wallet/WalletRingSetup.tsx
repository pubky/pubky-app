'use client';

import { useEffect, useState } from 'react';
import type { Network } from '@beignet/wallet-core';
import { KeyRound } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { inspectRingDevice, type RingDeviceStatus, RingEnrollmentError } from '@/services/wallet/ring-enrollment';
import type { WalletSession } from '@/services/wallet/session';
import { WalletDeviceSwitch } from './WalletDeviceSwitch';
import { WalletKeyApproval } from './WalletKeyApproval';
import { WalletPanel } from './WalletPanel';

export type RingSetupMode = 'create' | 'restore';

type Props = {
  account: string;
  network: Network;
  session: WalletSession;
  onCancel: () => void;
  onPhrase?: () => void;
  onKey: (key: Uint8Array, assertCurrent: () => void, mode: RingSetupMode, deviceId: string) => Promise<void>;
  onHandoff: (status: RingDeviceStatus, deviceId: string, key: Uint8Array, assertCurrent: () => void) => Promise<void>;
  progress?: number;
  localRingOnly?: boolean;
};

export function WalletRingSetup({
  account,
  network,
  session,
  onCancel,
  onPhrase,
  onKey,
  onHandoff,
  progress,
  localRingOnly,
}: Props) {
  const [device, setDevice] = useState<{ id: string; status: RingDeviceStatus }>();
  const [error, setError] = useState('');
  const [mode, setMode] = useState<RingSetupMode>();
  const [confirmed, setConfirmed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [recoverWithoutDevice, setRecoverWithoutDevice] = useState(false);
  useEffect(() => {
    let current = true;
    void (async () => {
      const id = await session.ringDeviceId();
      const status = await inspectRingDevice(account, network, id);
      if (!current) return;
      setDevice({ id, status });
      setMode(status.state === 'new' ? 'create' : 'restore');
    })().catch((reason: unknown) => {
      if (current)
        setError(
          reason instanceof RingEnrollmentError
            ? reason.message
            : 'Could not read your wallet registration from your Pubky homeserver. Reopen Ring setup to retry.',
        );
    });
    return () => {
      current = false;
    };
  }, [account, network, session]);

  if (
    device &&
    (device.status.state === 'handoff-ready' || (device.status.state === 'other-device' && !recoverWithoutDevice))
  ) {
    const status = device.status;
    return (
      <WalletDeviceSwitch
        key={status.state}
        account={account}
        network={network}
        progress={progress}
        action={status.state === 'handoff-ready' ? 'take' : 'elsewhere'}
        onRefresh={async (signal) => {
          const status = await inspectRingDevice(account, network, device.id);
          if (signal.aborted) return;
          setDevice({ id: device.id, status });
          return status.state;
        }}
        onClose={onCancel}
        onRecover={() => setRecoverWithoutDevice(true)}
        onApprove={(key, assertCurrent) => onHandoff(status, device.id, key, assertCurrent)}
      />
    );
  }

  if (approving && mode && device) {
    return (
      <WalletKeyApproval
        account={account}
        network={network}
        onCancel={onCancel}
        onKey={(key, assertCurrent) => onKey(key, assertCurrent, mode, device.id)}
      />
    );
  }
  return (
    <WalletPanel
      title={device?.status.state === 'other-device' ? 'Recover your Ring wallet' : 'Wallet with Pubky Ring'}
      icon={KeyRound}
    >
      <p className="text-sm text-muted-foreground">
        Ring can recover your Bitcoin keys from the same Pubky identity. Keep a backup of that identity.
        {localRingOnly ? ' Ring approval also unlocks this browser.' : ' Your wallet password protects this browser.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {!device && !error && <Spinner aria-label="Checking Ring wallet" />}
      {mode && device && (
        <>
          {mode === 'restore' && (
            <p className="text-sm text-muted-foreground">
              Close the wallet on your previous device before continuing. The recovery peer supplies Lightning channel
              backups. Funds may stay on hold while the channel state is verified.
            </p>
          )}
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            label={
              mode === 'restore'
                ? 'I closed any previous copy and will keep it closed.'
                : `This is my first Ring wallet on Bitcoin ${network}.`
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={!confirmed} onClick={() => setApproving(true)}>
              {mode === 'create' ? 'Create with Ring' : 'Recover with Ring'}
            </Button>
            {device.status.state === 'new' && (
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmed(false);
                  setMode(mode === 'create' ? 'restore' : 'create');
                }}
              >
                {mode === 'create' ? 'I already have a Ring wallet' : 'Create my first Ring wallet'}
              </Button>
            )}
          </div>
        </>
      )}
      {onPhrase && (
        <Button variant="outline" className="self-start" onClick={onPhrase}>
          Use a recovery phrase instead
        </Button>
      )}
      {!onPhrase && (
        <Button variant="outline" className="self-start" onClick={onCancel}>
          Lock wallet
        </Button>
      )}
    </WalletPanel>
  );
}
