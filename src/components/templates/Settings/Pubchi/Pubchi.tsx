'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import {
  PUBCHI_HOSTED_BRAIN,
  type PubchiBrainChoice,
  PubchiBrainPanel,
} from '@/components/organisms/Pubchi/PubchiBrainPanel/PubchiBrainPanel';
import { PubchiPreferencesForm } from '@/components/organisms/Pubchi/PubchiPreferencesForm/PubchiPreferencesForm';
import { PubchiProfileCard } from '@/components/organisms/Pubchi/PubchiProfileCard/PubchiProfileCard';
import { type PubchiTier, PubchiTierPanel } from '@/components/organisms/Pubchi/PubchiTierPanel/PubchiTierPanel';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { BACKUP_FORM_FIELDS, ENROLL_FORM_FIELDS } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment.types';
import { PUBCHI_DEGRADED_SESSION_MESSAGE } from '@/libs/pubchi/capabilities';
import { effectiveTier, effectiveTierReason } from '@/libs/pubchi/effective-tier';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { DEFAULT_SEND_PUBLIC_WEB_CONTEXT, type PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { toast } from '@/molecules/Toaster/toast';
import { RingApprovalDialog } from '@/organisms/RingApprovalDialog/RingApprovalDialog';
import { PubchiSettingsSkeleton } from './Pubchi.skeleton';

export const PUBCHI_SETTINGS_SURFACE = 'pubchi-settings';

export function PubchiSettings() {
  const [previousBrain, setPreviousBrain] = useState<PubchiBrainChoice | undefined>();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const {
    form,
    backupForm,
    submit,
    confirmBackup,
    openBackup,
    closeBackup,
    remove,
    revokeDevice,
    revokeAllDevices,
    reapprove,
    context,
    contextEditable,
    saveContext,
    needsReapproval,
    binding,
    pubchi,
    config,
    saveConfig,
    acceptSavedConfig,
    creating,
    backupOpen,
    backupPositions,
    backupController,
    devices = [],
    pendingRevocations = [],
    deviceListingHadFailures,
    currentSigner,
    loading,
    enrollmentLoaded,
    enabled,
  } = usePubchiEnrollment();

  if (!enabled || !isPubchiEnabled()) {
    return null;
  }

  return (
    <div data-surface={PUBCHI_SETTINGS_SURFACE} data-testid={PUBCHI_SETTINGS_SURFACE}>
      <SettingsSectionCard
        icon={Bot}
        title="Pubchi"
        description="Create a personal bot identity bound to your Pubky account."
      >
        {needsReapproval ? (
          <div className="flex flex-col gap-3 px-6" data-testid="pubchi-degraded-session">
            <Typography size="sm">{PUBCHI_DEGRADED_SESSION_MESSAGE}</Typography>
            <Button type="button" disabled={loading} onClick={() => setApprovalOpen(true)}>
              Re-approve
            </Button>
          </div>
        ) : null}
        {pendingRevocations.length ? (
          <div className="flex flex-col gap-3 px-6" data-testid="pubchi-pending-revocations">
            <Typography size="sm">Revoked on this device — homeserver revocation pending re-approval.</Typography>
            <Button type="button" disabled={loading} onClick={() => setApprovalOpen(true)}>
              Re-approve to finish revocation
            </Button>
          </div>
        ) : null}
        {creating ? (
          <div className="flex flex-col gap-3 px-6" role="status" data-testid="pubchi-create-progress">
            <Typography size="sm">Creating your Pubchi…</Typography>
            <Typography size="xs">Minting the key, verifying the binding, and authorizing this browser.</Typography>
          </div>
        ) : null}
        {!enrollmentLoaded ? <PubchiSettingsSkeleton /> : null}
        {enrollmentLoaded && (pubchi || binding) ? (
          <div className="flex flex-col gap-4 px-6">
            {pubchi ? (
              <>
                <PubchiProfileCard
                  bot={pubchi.bot}
                  displayName={config?.display_name ?? pubchi.displayName}
                  createdAt={pubchi.createdAt}
                  verified={pubchi.verified}
                  backupConfirmed={Boolean(pubchi.backupConfirmedAt)}
                  tier={effectiveTier({
                    desired: config?.tier ?? 'read-only',
                    sessionCoversPubchi: !needsReapproval,
                    ceiling: 'assisted',
                  })}
                  brainLabel={brainLabel(config?.brain)}
                  onBackup={pubchi.verified && !pubchi.backupConfirmedAt && !needsReapproval ? openBackup : undefined}
                  onRemove={!needsReapproval ? () => void remove() : undefined}
                />
                {config !== undefined ? (
                  <PubchiTierPanel
                    desiredTier={config?.tier ?? 'read-only'}
                    effectiveTier={effectiveTier({
                      desired: config?.tier ?? 'read-only',
                      sessionCoversPubchi: !needsReapproval,
                      ceiling: 'assisted',
                    })}
                    effectiveReason={effectiveTierReason({
                      desired: config?.tier ?? 'read-only',
                      sessionCoversPubchi: !needsReapproval,
                      ceiling: 'assisted',
                    })}
                    availableTiers={['read-only', 'assisted']}
                    autonomousDisabledReason="Autonomous publishing arrives after homeserver session revocation ships."
                    saving={loading || needsReapproval}
                    onChangeDesired={(tier) => void saveTier(tier, saveConfig)}
                  />
                ) : null}
                {config !== undefined ? (
                  <PubchiBrainPanel
                    value={toBrainChoice(config?.brain)}
                    previous={previousBrain}
                    saving={loading || needsReapproval}
                    context={context}
                    contextEditable={contextEditable}
                    onSaveContext={saveContext}
                    onReapprove={reapprove}
                    onRequestReapprove={() => setApprovalOpen(true)}
                    onChange={(brain) => {
                      setPreviousBrain(toBrainChoice(config?.brain));
                      void saveBrain(brain, config, saveConfig);
                    }}
                    onRollback={
                      previousBrain
                        ? () => {
                            void saveBrain(previousBrain, config, saveConfig);
                            setPreviousBrain(undefined);
                          }
                        : undefined
                    }
                  />
                ) : null}
                {devices.length || deviceListingHadFailures ? (
                  <PubchiDeviceSigners
                    devices={devices}
                    deviceListingHadFailures={deviceListingHadFailures}
                    currentSigner={currentSigner}
                    loading={loading}
                    needsReapproval={needsReapproval}
                    revokeDevice={revokeDevice}
                    revokeAllDevices={revokeAllDevices}
                  />
                ) : null}
                {config !== undefined ? <PubchiPreferencesForm onSaved={acceptSavedConfig} /> : null}
              </>
            ) : (
              <>
                <Typography size="sm">
                  Active shared Pubchi: <span className="font-mono break-all">{binding?.bot}</span>
                </Typography>
                <Typography size="sm">
                  This is a shared Pubchi from the early beta. Remove it to create your own.
                </Typography>
              </>
            )}
            {!pubchi ? (
              <Button
                type="button"
                variant="destructive"
                data-testid="pubchi-remove-bot"
                disabled={loading || needsReapproval}
                onClick={() => {
                  void remove();
                }}
              >
                Remove Pubchi
              </Button>
            ) : null}
          </div>
        ) : enrollmentLoaded && !creating ? (
          <form
            className="flex flex-col gap-4 px-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Typography data-testid="pubchi-not-enrolled" size="sm">
              Create a Pubchi for this account. Your Pubchi is a personal bot with its own key. Its settings live on
              your homeserver and anyone can read them.
            </Typography>
            <ControlledInputField
              name={ENROLL_FORM_FIELDS.DISPLAY_NAME}
              control={form.control}
              label="Name"
              placeholder="Name your Pubchi"
              dataCy="pubchi-name-input"
            />
            <Button type="submit" data-testid="pubchi-create" disabled={loading || needsReapproval}>
              Create
            </Button>
          </form>
        ) : null}
        {backupOpen ? (
          <div className="flex flex-col gap-4 px-6 select-none" data-testid="pubchi-backup-reveal">
            <Typography size="sm">
              Write these words down. They cannot be copied or shown again after you leave.
            </Typography>
            <div className="grid grid-cols-2 gap-2 select-none" aria-label="Pubchi recovery words">
              {backupController.words().map((word, index) => (
                <span className="rounded-md border p-2 text-sm" key={index}>
                  {index + 1}. {word}
                </span>
              ))}
            </div>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmBackup();
              }}
            >
              {backupPositions.map((position, index) => (
                <ControlledInputField
                  key={position}
                  name={
                    [BACKUP_FORM_FIELDS.WORD_ONE, BACKUP_FORM_FIELDS.WORD_TWO, BACKUP_FORM_FIELDS.WORD_THREE][index]!
                  }
                  control={backupForm.control}
                  label={`Word ${position + 1}`}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              ))}
              <Button type="submit" disabled={loading}>
                Confirm backup
              </Button>
              <Button type="button" variant="secondary" disabled={loading} onClick={closeBackup}>
                Not now
              </Button>
            </form>
          </div>
        ) : null}
        {enrollmentLoaded && !pubchi && (devices.length || deviceListingHadFailures) ? (
          <PubchiDeviceSigners
            devices={devices}
            deviceListingHadFailures={deviceListingHadFailures}
            currentSigner={currentSigner}
            loading={loading}
            needsReapproval={needsReapproval}
            revokeDevice={revokeDevice}
            revokeAllDevices={revokeAllDevices}
          />
        ) : null}
      </SettingsSectionCard>
      <RingApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        onApproved={async (session) => {
          return await reapprove(session);
        }}
      />
    </div>
  );
}

function PubchiDeviceSigners({
  devices,
  deviceListingHadFailures,
  currentSigner,
  loading,
  needsReapproval,
  revokeDevice,
  revokeAllDevices,
}: {
  devices: Array<{
    signer: string;
    purposes: string[];
    created_at: number;
    expires_at: number;
  }>;
  deviceListingHadFailures: boolean;
  currentSigner?: string;
  loading: boolean;
  needsReapproval: boolean;
  revokeDevice: (signer: string) => Promise<boolean>;
  revokeAllDevices: () => Promise<boolean>;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="pubchi-device-signers">
      {devices.length ? <Typography size="sm">Device signers</Typography> : null}
      {deviceListingHadFailures ? <Typography size="xs">Some device records could not be loaded</Typography> : null}
      {devices.map((device) => (
        <div className="flex items-center justify-between gap-3" key={device.signer}>
          <Typography size="sm" className="break-all">
            {device.signer}
            {device.signer === currentSigner ? ' (this browser)' : ''}
            <span className="block text-xs opacity-70">
              Created {new Date(device.created_at * 1000).toLocaleDateString()} · Expires{' '}
              {new Date(device.expires_at * 1000).toLocaleDateString()}
            </span>
            <span className="block text-xs opacity-70">Purposes: {device.purposes.join(', ')}</span>
          </Typography>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || needsReapproval}
            onClick={() => void revokeDevice(device.signer)}
          >
            Revoke
          </Button>
        </div>
      ))}
      {devices.length ? (
        <Button
          type="button"
          variant="secondary"
          disabled={loading || needsReapproval}
          onClick={() => void revokeAllDevices()}
        >
          Revoke all
        </Button>
      ) : null}
    </div>
  );
}

function toBrainChoice(brain: PubchiConfigV1['brain'] | undefined): PubchiBrainChoice {
  if (!brain || brain.execution === 'synonym-hosted') return PUBCHI_HOSTED_BRAIN;
  return {
    execution: 'self-hosted',
    provider_id: brain.provider_id === 'ollama' ? 'ollama' : 'openai-compatible',
    model_id: brain.model_id,
    endpoint: brain.endpoint ?? '',
  };
}

async function saveTier(
  tier: PubchiTier,
  saveConfig: (partial: Partial<PubchiConfigV1>) => Promise<PubchiConfigV1 | undefined>,
) {
  try {
    await saveConfig({ tier });
    toast({ variant: 'default', title: 'Tier saved', dismissButton: true });
  } catch {
    toast({ variant: 'error', title: 'Could not save tier', dismissButton: true });
  }
}

export async function saveBrain(
  brain: PubchiBrainChoice,
  config: PubchiConfigV1 | null | undefined,
  saveConfig: (partial: Partial<PubchiConfigV1>) => Promise<PubchiConfigV1 | undefined>,
) {
  try {
    await saveConfig({
      brain: {
        adapter: 'vercel-ai',
        execution: brain.execution,
        provider_id: brain.execution === 'synonym-hosted' ? 'moonshot' : brain.provider_id,
        model_id: brain.execution === 'synonym-hosted' ? 'kimi-k3' : brain.model_id,
        endpoint: brain.execution === 'synonym-hosted' ? null : brain.endpoint,
        send_public_graph_context: config?.brain.send_public_graph_context ?? true,
        send_public_web_context: config?.brain.send_public_web_context ?? DEFAULT_SEND_PUBLIC_WEB_CONTEXT,
      },
    });
    toast({ variant: 'default', title: 'Brain saved', dismissButton: true });
  } catch {
    toast({ variant: 'error', title: 'Could not save brain', dismissButton: true });
  }
}

function brainLabel(brain: PubchiConfigV1['brain'] | undefined): string {
  if (!brain || brain.execution === 'synonym-hosted') return 'Kimi K3 (Synonym-hosted)';
  return `Self-hosted · ${brain.provider_id}`;
}
