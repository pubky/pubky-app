'use client';

import { RefreshCw } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { IndexerController } from '@/controllers/indexer/indexer';
import { useLocalIndexStatus } from '@/hooks/useLocalIndexStatus/useLocalIndexStatus';
import type { RuntimeState, RuntimeStatus } from '@/libs/indexer/runtime.types';
import { SettingsDivider } from '@/molecules/Settings/SettingsDivider/SettingsDivider';
import { SettingsSection } from '@/molecules/Settings/SettingsSection/SettingsSection';

const STATE_LABELS: Record<RuntimeState, string> = {
  idle: 'Idle',
  syncing: 'Syncing',
  stopped: 'Stopped',
  error: 'Error',
};

const formatTime = (ms: number | null): string => (ms === null ? 'Never' : new Date(ms).toLocaleString('en-US'));

type Row = [label: string, value: string];

function statusRows(status: RuntimeStatus): Row[] {
  const { stats, savedIndex } = status;
  const rows: Row[] = [
    ['State', STATE_LABELS[status.state]],
    ['First sync', status.firstSyncPending ? 'Running' : 'Done'],
    ['Tags and counts', status.bodiesPending ? 'Loading' : 'Done'],
    ['Last sync', formatTime(status.lastSyncAt)],
    ...stats.usersPerHop.map((users, hop): Row => [`Users at hop ${hop}`, String(users)]),
    ['Homeservers reached', String(stats.homeserversSeen)],
    ['Homeservers failed', String(stats.homeserversFailed)],
    ['Lookups', String(stats.lookups)],
    ['Stream requests', String(stats.streamRequests)],
    ['File fetches', String(stats.bodyRequests)],
    ['Events', String(stats.events)],
  ];
  if (status.lastError) rows.push(['Last error', status.lastError.message]);
  if (savedIndex) {
    rows.push(['Saved index written', formatTime(savedIndex.lastSavedAt)]);
    rows.push(['Saved index files loaded', String(savedIndex.loadedFiles)]);
    if (savedIndex.error) rows.push(['Saved index error', savedIndex.error.message]);
  }
  return rows;
}

/**
 * What the local index has read of the user's network, updated as it syncs, with a button to sync now. Counts are of
 * this tab's index since it started.
 */
export function LocalIndexStatus() {
  const status = useLocalIndexStatus((current) => current);

  if (status === null) {
    return (
      <Typography as="p" size="md" className="text-secondary-foreground">
        {'The local index is not running in this tab.'}
      </Typography>
    );
  }

  return (
    <>
      <Container overrideDefaults className="flex w-full flex-col gap-2" data-testid="local-index-stats">
        {statusRows(status).map(([label, value]) => (
          <Container key={label} overrideDefaults className="flex w-full items-start justify-between gap-4">
            <Typography as="span" size="sm" className="text-secondary-foreground">
              {label}
            </Typography>
            <Typography as="span" size="sm" className="text-right break-all">
              {value}
            </Typography>
          </Container>
        ))}
      </Container>
      <SettingsDivider />
      <SettingsSection
        title={'Sync now'}
        description={'Read the homeservers of your network again instead of waiting for the next sync.'}
        buttonText={status.state === 'syncing' ? 'Syncing...' : 'Sync now'}
        buttonIcon={RefreshCw}
        buttonId="local-index-sync-btn"
        buttonDisabled={status.state === 'syncing' || status.state === 'stopped'}
        buttonOnClick={() => IndexerController.syncLocalIndexNow()}
      />
    </>
  );
}
