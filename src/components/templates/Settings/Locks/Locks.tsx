'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useLocksSettingsStatus } from '@/hooks/useLocksSettingsStatus/useLocksSettingsStatus';
import type { LocksSettingsStatus } from '@/hooks/useLocksSettingsStatus/useLocksSettingsStatus.types';
import { usePaidUnlockAvailability } from '@/hooks/usePaidUnlockAvailability/usePaidUnlockAvailability';
import { LocksRegionNotice } from '@/molecules/LocksRegionNotice/LocksRegionNotice';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';
import { LocksEnabledCard } from '@/organisms/Settings/LocksEnabledCard/LocksEnabledCard';

const CHECK_FAILED = 'Something went wrong while checking your Bitkit wallet.';

const DESCRIPTIONS = {
  loading: undefined,
  'not-set-up': 'Enable Locks to earn from your content.',
  'set-up': 'You are able to receive payments and earn bitcoin from your content.',
  unavailable: CHECK_FAILED,
  error: CHECK_FAILED,
} satisfies Record<LocksSettingsStatus, string | undefined>;

// Figma v28 words the mobile frames differently. Below `lg`, Settings shows its mobile layout.
const MOBILE_DESCRIPTIONS = {
  ...DESCRIPTIONS,
  'not-set-up': 'Enable Locks to earn money from your content.',
  'set-up': 'You are able to receive payments and earn money from your content.',
} satisfies Record<LocksSettingsStatus, string | undefined>;

export function Locks() {
  const [authDialog, setAuthDialog] = useState<'setup' | 'reconnect' | null>(null);
  const { status, recheck, markSetUp } = useLocksSettingsStatus({ paused: authDialog !== null });
  const paidUnlocks = usePaidUnlockAvailability();
  const isMobile = useIsMobile();

  return (
    <SettingsSectionCard
      icon={Lock}
      title={'Locks'}
      description={(isMobile ? MOBILE_DESCRIPTIONS : DESCRIPTIONS)[status]}
      wrapChildren={status === 'set-up'}
    >
      {status === 'loading' && (
        <Container overrideDefaults className="flex w-full justify-center py-6">
          <Spinner aria-label={'Checking your Locks setup'} />
        </Container>
      )}

      {status === 'not-set-up' && (
        <Container overrideDefaults className="flex flex-col items-start gap-4">
          <Button
            variant={ButtonVariant.DEFAULT}
            disabled={paidUnlocks.status !== 'available'}
            onClick={() => setAuthDialog('setup')}
          >
            {'Enable Locks'}
          </Button>
          {paidUnlocks.status === 'blocked' && <LocksRegionNotice cause={paidUnlocks.cause} />}
        </Container>
      )}

      {status === 'set-up' && <LocksEnabledCard onRecheck={recheck} />}

      {(status === 'unavailable' || status === 'error') && (
        <Container overrideDefaults className="flex flex-wrap gap-4">
          <Button variant={ButtonVariant.OUTLINE} onClick={recheck}>
            {'Try again'}
          </Button>
          {/* #2984: only the Lock Server's own `unavailable` hints at a revoked Paykit grant; docs/locks.md. */}
          {status === 'unavailable' && (
            <Button variant={ButtonVariant.DEFAULT} onClick={() => setAuthDialog('reconnect')}>
              {'Reconnect Bitkit'}
            </Button>
          )}
        </Container>
      )}

      <DialogLocksAuth
        open={authDialog !== null}
        onOpenChange={(open) => {
          if (!open) setAuthDialog(null);
        }}
        startAtHeldCheck={authDialog === 'reconnect'}
        onSuccess={markSetUp}
      />
    </SettingsSectionCard>
  );
}
