import { createElement } from 'react';
import type { Session } from '@synonymdev/pubky';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import type { OwnerBindingV1 } from '@/libs/pubchi/schemas/tenant';
import { RingApprovalDialog } from '@/organisms/RingApprovalDialog/RingApprovalDialog';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { usePubchiEnrollment } from './usePubchiEnrollment';
import { ENROLL_FORM_FIELDS } from './usePubchiEnrollment.types';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const ACTIVE: OwnerBindingV1 = {
  schema: 'pubchi-owner-binding',
  version: 1,
  owner: OWNER,
  bot: OWNER,
  status: 'active',
  created_at: 1,
  updated_at: 1,
};

const CONFIG: PubchiConfigV1 = {
  schema: 'pubchi-config',
  version: 1,
  owner: OWNER,
  bot: OWNER,
  updated_at: 1,
  display_name: 'Scout',
  tier: 'assisted',
  language: 'en',
  summary: { length: 'medium', include_sources: true, include_disagreement: true },
  interests: { topics: [], excluded_topics: [] },
  proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
  follower_history_opt_in: false,
  brain: {
    adapter: 'vercel-ai',
    execution: 'synonym-hosted',
    provider_id: 'moonshot',
    model_id: 'kimi-k3',
    endpoint: null,
    send_public_graph_context: true,
    send_public_web_context: false,
  },
};

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  load: vi.fn(),
  loadConfig: vi.fn(),
  loadContext: vi.fn(),
  create: vi.fn(),
  confirm: vi.fn(),
  remove: vi.fn(),
  devices: vi.fn(),
  ensureDeviceReady: vi.fn(),
  revokeDevice: vi.fn(),
  revokeAllDevices: vi.fn(),
  hadDeviceListingFailures: vi.fn(),
  toast: vi.fn(),
  getUrl: vi.fn(),
  adopt: vi.fn(),
  capabilities: [] as string[],
  owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as string | null,
  generation: 'first',
}));

function postSyncMessage(owner: string, kind: string): void {
  const channel = new BroadcastChannel('pubchi');
  channel.postMessage({ owner, kind, at: Date.now() });
  channel.close();
}

class TestBroadcastChannel {
  static channels = new Set<TestBroadcastChannel>();
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(readonly name: string) {
    TestBroadcastChannel.channels.add(this);
  }

  addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown): void {
    for (const channel of TestBroadcastChannel.channels) {
      if (channel === this || channel.name !== this.name) continue;
      queueMicrotask(() => {
        for (const listener of channel.listeners) listener({ data } as MessageEvent<unknown>);
      });
    }
  }

  close(): void {
    TestBroadcastChannel.channels.delete(this);
    this.listeners.clear();
  }
}

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    reconcileActiveBinding: (...args: unknown[]) => mocks.reconcile(...args),
    loadPubchi: (...args: unknown[]) => mocks.load(...args),
    loadPubchiConfig: (...args: unknown[]) => mocks.loadConfig(...args),
    loadPubchiContext: (...args: unknown[]) => mocks.loadContext(...args),
    createPubchi: (...args: unknown[]) => mocks.create(...args),
    confirmBackup: (...args: unknown[]) => mocks.confirm(...args),
    commitDeleteBinding: (...args: unknown[]) => mocks.remove(...args),
    listDeviceKeys: (...args: unknown[]) => mocks.devices(...args),
    ensureDeviceReady: (...args: unknown[]) => mocks.ensureDeviceReady(...args),
    revokeDevice: (...args: unknown[]) => mocks.revokeDevice(...args),
    revokeAllDevices: (...args: unknown[]) => mocks.revokeAllDevices(...args),
    hadDeviceListingFailures: (...args: unknown[]) => mocks.hadDeviceListingFailures(...args),
    getCapabilityApprovalUrl: (...args: unknown[]) => mocks.getUrl(...args),
    adoptCapabilityApproval: (...args: unknown[]) => mocks.adopt(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/libs/pubchi/device-key', () => ({
  getCurrentDeviceKey: async () => undefined,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (
      selector: (state: {
        currentUserPubky: string | null;
        generation: string;
        session: { info: { capabilities: string[] } };
      }) => unknown,
    ) =>
      selector({
        currentUserPubky: mocks.owner,
        generation: mocks.generation,
        session: { info: { capabilities: mocks.capabilities } },
      }),
    {
      getState: () => ({
        currentUserPubky: mocks.owner,
        generation: mocks.generation,
        session: { info: { capabilities: mocks.capabilities } },
      }),
    },
  ),
}));

describe('usePubchiEnrollment', () => {
  beforeEach(() => {
    usePubchiStore.getState().clear();
    mocks.owner = OWNER;
    mocks.generation = 'first';
    mocks.reconcile.mockReset();
    mocks.load.mockReset().mockResolvedValue(undefined);
    mocks.loadConfig.mockReset().mockResolvedValue(null);
    mocks.loadContext.mockReset().mockResolvedValue(null);
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    mocks.create.mockReset();
    mocks.confirm.mockReset();
    mocks.remove.mockReset();
    mocks.devices.mockReset().mockResolvedValue([]);
    mocks.ensureDeviceReady.mockReset().mockResolvedValue(true);
    mocks.revokeDevice.mockReset().mockResolvedValue(undefined);
    mocks.revokeAllDevices.mockReset().mockResolvedValue({ revoked: [], failed: [], unlisted: 0 });
    mocks.hadDeviceListingFailures.mockReset().mockReturnValue(false);
    mocks.toast.mockReset();
    mocks.getUrl.mockReset();
    mocks.adopt.mockReset();
    mocks.capabilities = [];
  });

  it('keeps bot and config state when private context loading fails', async () => {
    mocks.reconcile.mockResolvedValue(ACTIVE);
    mocks.load.mockResolvedValue({
      bot: OWNER,
      displayName: 'Scout',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    mocks.loadConfig.mockResolvedValue(CONFIG);
    mocks.loadContext.mockRejectedValue(new Error('context unavailable'));

    renderHook(() => usePubchiEnrollment());

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pubchi context could not be loaded', variant: 'error' }),
      );
    });
    expect(usePubchiStore.getState().pubchi).toBeDefined();
    expect(usePubchiStore.getState().config).toEqual(CONFIG);
    expect(usePubchiStore.getState().context).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Pubchi could not be loaded' }));
  });

  it('synchronizes a store update to another mounted instance', async () => {
    const first = renderHook(() => usePubchiEnrollment());
    const second = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    act(() => {
      usePubchiStore
        .getState()
        .setPubchi({ bot: OWNER, displayName: 'Shared', createdAt: 1, backupConfirmedAt: null, verified: true }, OWNER);
    });

    await waitFor(() => expect(first.result.current.pubchi?.displayName).toBe('Shared'));
    expect(second.result.current.pubchi?.displayName).toBe('Shared');
  });

  it('reloads once for a current-owner message and updates the mounted display name', async () => {
    mocks.load.mockResolvedValueOnce(undefined).mockResolvedValue({
      bot: OWNER,
      displayName: 'Scout III',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    mocks.loadConfig.mockResolvedValue({ ...CONFIG, display_name: 'Scout III' });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    act(() => postSyncMessage(OWNER, 'config-saved'));

    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(result.current.pubchi?.displayName).toBe('Scout III');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(usePubchiStore.getState().syncReloadCount).toBe(1);
  });

  it('limits a one-second burst of fifty sync messages to five reloads', async () => {
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    for (let index = 0; index < 50; index += 1) {
      act(() => postSyncMessage(OWNER, 'config-saved'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(usePubchiStore.getState().syncReloadCount).toBeLessThanOrEqual(5);
    expect(result.current.pubchi).toBeUndefined();
  });

  it('shows a pause after five spaced reloads and resumes automatically without bypassing the limit', async () => {
    const { result, unmount } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.enrollmentLoaded).toBe(true));
    vi.useFakeTimers();
    try {
      for (let index = 0; index < 6; index += 1) {
        await act(async () => {
          postSyncMessage(OWNER, 'config-saved');
          await vi.advanceTimersByTimeAsync(200);
        });
      }
      expect(mocks.load).toHaveBeenCalledTimes(6);
      expect(result.current.syncStatus).toBe('rate-limited');

      await act(async () => {
        result.current.retrySync();
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mocks.load).toHaveBeenCalledTimes(6);
      expect(result.current.syncStatus).toBe('rate-limited');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mocks.load).toHaveBeenCalledTimes(7);
      expect(result.current.syncStatus).toBe('idle');
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('keeps cached data visible on sync failure and clears the error after a successful retry', async () => {
    mocks.load.mockResolvedValue({
      bot: OWNER,
      displayName: 'Scout',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.enrollmentLoaded).toBe(true));
    mocks.load.mockRejectedValueOnce(new Error('sync unavailable'));

    act(() => postSyncMessage(OWNER, 'config-saved'));
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    expect(result.current.pubchi?.displayName).toBe('Scout');

    mocks.load.mockResolvedValue({
      bot: OWNER,
      displayName: 'Scout II',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    act(() => result.current.retrySync());
    await waitFor(() => expect(result.current.syncStatus).toBe('idle'));
    expect(result.current.pubchi?.displayName).toBe('Scout II');
    expect(mocks.load).toHaveBeenCalledTimes(3);
  });

  it.each(['owner', 'generation'])('ignores an old sync failure after the %s changes', async (changed) => {
    const { result, rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.enrollmentLoaded).toBe(true));
    let rejectReload!: (error: Error) => void;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectReload = reject;
        }),
    );
    act(() => postSyncMessage(OWNER, 'config-saved'));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));

    if (changed === 'owner') mocks.owner = 'a'.repeat(52);
    else mocks.generation = 'second';
    rerender();
    await waitFor(() => expect(result.current.enrollmentLoaded).toBe(true));
    await act(async () => rejectReload(new Error('old owner sync failed')));
    expect(result.current.syncStatus).toBe('idle');
  });

  it('keeps sync reloads serialized across local cache timestamp changes', async () => {
    const { result, unmount } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.enrollmentLoaded).toBe(true));
    let finishReload!: (value: undefined) => void;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishReload = resolve;
        }),
    );
    vi.useFakeTimers();
    try {
      await act(async () => {
        postSyncMessage(OWNER, 'config-saved');
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mocks.load).toHaveBeenCalledTimes(2);
      act(() => usePubchiStore.setState({ lastUpdatedAt: Date.now() + 1 }));
      await act(async () => {
        postSyncMessage(OWNER, 'config-saved');
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mocks.load).toHaveBeenCalledTimes(2);
      await act(async () => finishReload(undefined));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mocks.load).toHaveBeenCalledTimes(3);
      expect(result.current.syncStatus).toBe('idle');
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('ignores messages for a different owner without reloading', async () => {
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    act(() => postSyncMessage('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'config-saved'));

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(result.current.pubchi).toBeUndefined();
  });

  it('ignores unknown and stale sync messages', async () => {
    renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    act(() => {
      const channel = new BroadcastChannel('pubchi');
      channel.postMessage({ owner: OWNER, kind: 'unknown', at: Date.now() });
      channel.postMessage({ owner: OWNER, kind: 'config-saved', at: Date.now() - 15_001 });
      channel.close();
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.load).toHaveBeenCalledOnce();
  });

  it('does not reload from a foreign-owner sign-out message after signing out', async () => {
    const { rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    mocks.owner = null;
    rerender();
    act(() => postSyncMessage('a'.repeat(52), 'signed-out'));

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(usePubchiStore.getState().ownerPubky).toBeNull();
  });

  it('reloads once after stale visibility regain and debounces rapid toggles', async () => {
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    mocks.load.mockResolvedValue({
      bot: OWNER,
      displayName: 'Visible Again',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      usePubchiStore.setState({ lastUpdatedAt: Date.now() - 15_001 });
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(result.current.pubchi?.displayName).toBe('Visible Again');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it('does not reload when visibility regain is younger than fifteen seconds', async () => {
    renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    act(() => {
      usePubchiStore.setState({ lastUpdatedAt: Date.now() - 14_999 });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.load).toHaveBeenCalledOnce();
  });

  it('catches a rejected sync reload', async () => {
    renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    mocks.load.mockRejectedValueOnce(new Error('sync unavailable'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    try {
      act(() => postSyncMessage(OWNER, 'config-saved'));
      await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('clears the receiving tab on a signed-out message', async () => {
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    act(() => {
      usePubchiStore
        .getState()
        .setPubchi({ bot: OWNER, displayName: 'Scout', createdAt: 1, backupConfirmedAt: null, verified: true }, OWNER);
    });
    postSyncMessage(OWNER, 'signed-out');

    await waitFor(() => expect(result.current.pubchi).toBeUndefined());
    expect(usePubchiStore.getState().ownerPubky).toBeNull();
  });

  it('does not repopulate the store after sign-out during a load', async () => {
    let resolveLoad!: (value: {
      bot: string;
      displayName: string;
      createdAt: number;
      backupConfirmedAt: null;
      verified: boolean;
    }) => void;
    mocks.load.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const { rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    mocks.owner = null;
    rerender();
    await act(async () => {
      resolveLoad({ bot: OWNER, displayName: 'A', createdAt: 1, backupConfirmedAt: null, verified: true });
    });

    expect(usePubchiStore.getState().ownerPubky).toBeNull();
    expect(usePubchiStore.getState().pubchi).toBeUndefined();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Pubchi could not be loaded' }));
  });

  it('keeps the next identity from seeing the previous identity bot', async () => {
    const otherOwner = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    let resolveA!: (value: {
      bot: string;
      displayName: string;
      createdAt: number;
      backupConfirmedAt: null;
      verified: boolean;
    }) => void;
    let resolveB!: (value: {
      bot: string;
      displayName: string;
      createdAt: number;
      backupConfirmedAt: null;
      verified: boolean;
    }) => void;
    mocks.load
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveA = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveB = resolve;
        }),
      );
    const { result, rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());

    mocks.owner = otherOwner;
    rerender();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(result.current.pubchi).toBeUndefined();
    expect(usePubchiStore.getState().ownerPubky).toBeNull();

    await act(async () => {
      resolveB({ bot: otherOwner, displayName: 'B', createdAt: 2, backupConfirmedAt: null, verified: true });
    });
    await waitFor(() => expect(result.current.pubchi?.displayName).toBe('B'));

    await act(async () => {
      resolveA({ bot: OWNER, displayName: 'A', createdAt: 1, backupConfirmedAt: null, verified: true });
    });

    expect(usePubchiStore.getState().ownerPubky).toBe(otherOwner);
    expect(result.current.pubchi?.displayName).toBe('B');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    TestBroadcastChannel.channels.clear();
  });

  it('reconciles the Dexie binding with the homeserver on load', async () => {
    mocks.reconcile.mockResolvedValue(ACTIVE);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => {
      expect(result.current.binding).toEqual(ACTIVE);
    });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(mocks.ensureDeviceReady).toHaveBeenCalledOnce();
  });

  it('renders remote device signers and revokes a non-local signer', async () => {
    const remoteSigner = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
    const remoteDevice = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: OWNER,
      signer: remoteSigner,
      bot: OWNER,
      purposes: ['ask', 'who-tagged-me', 'build-feed'],
      created_at: 1,
      expires_at: 2_000_000_000,
      signature: 'a'.repeat(128),
    };
    mocks.devices.mockResolvedValue([remoteDevice]);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.devices).toEqual([remoteDevice]));

    await act(async () => {
      await expect(result.current.revokeDevice(remoteSigner)).resolves.toBe(true);
    });

    expect(mocks.revokeDevice).toHaveBeenCalledWith(remoteSigner);
    expect(mocks.devices).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded devices and shows a warning after partial revoke-all listing', async () => {
    const device = {
      schema: 'pubchi-device-delegation' as const,
      version: 1 as const,
      owner: OWNER,
      signer: 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
      bot: OWNER,
      purposes: ['ask', 'who-tagged-me', 'build-feed'] as const,
      created_at: 1,
      expires_at: 2_000_000_000,
      signature: 'a'.repeat(128),
    };
    mocks.devices.mockResolvedValueOnce([device]).mockResolvedValueOnce([device]);
    mocks.revokeAllDevices.mockResolvedValue({ revoked: [device.signer], failed: [], unlisted: 1 });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.devices).toEqual([device]));

    await act(async () => {
      await expect(result.current.revokeAllDevices()).resolves.toBe(false);
    });

    expect(result.current.devices).toEqual([device]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some device records could not be loaded; homeserver revocation is pending re-approval.',
      }),
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'All devices revoked' }));
  });

  it('clears devices and shows success after revoke-all completes', async () => {
    const device = {
      schema: 'pubchi-device-delegation' as const,
      version: 1 as const,
      owner: OWNER,
      signer: 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
      bot: OWNER,
      purposes: ['ask', 'who-tagged-me', 'build-feed'] as const,
      created_at: 1,
      expires_at: 2_000_000_000,
      signature: 'a'.repeat(128),
    };
    mocks.devices.mockResolvedValueOnce([device]).mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.devices).toEqual([device]));

    await act(async () => {
      await expect(result.current.revokeAllDevices()).resolves.toBe(true);
    });

    expect(result.current.devices).toEqual([]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'All devices revoked' }));
  });

  it('updates the loaded profile name from the saved controller result', async () => {
    mocks.load.mockResolvedValue({
      bot: OWNER,
      displayName: 'Scout',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.pubchi?.displayName).toBe('Scout'));

    act(() => {
      result.current.acceptSavedConfig({ ...CONFIG, display_name: 'Scout II' });
    });

    expect(result.current.pubchi?.displayName).toBe('Scout II');
    expect(result.current.config?.display_name).toBe('Scout II');
  });

  it('loads the pointer before reconciling the local binding', async () => {
    const calls: string[] = [];
    mocks.load.mockImplementation(async () => {
      calls.push('load');
      return undefined;
    });
    mocks.reconcile.mockImplementation(async () => {
      calls.push('reconcile');
      return undefined;
    });
    renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce());
    expect(calls).toEqual(['load', 'reconcile']);
  });

  it('shows not enrolled when reconcile finds no homeserver object', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => {
      expect(result.current.binding).toBeUndefined();
    });
    expect(result.current.enabled).toBe(true);
  });

  it('handles initial load rejection without an unhandled promise', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.load.mockRejectedValue(new Error('unavailable'));
    renderHook(() => usePubchiEnrollment());
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pubchi could not be loaded', variant: 'error' }),
      ),
    );
  });

  it('updates the binding after enroll', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'test phrase held only by this mock',
    });
    mocks.reconcile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(ACTIVE);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, 'Pubchi');
      await result.current.submit();
    });

    expect(result.current.binding).toEqual(ACTIVE);
  });

  it('does not write the store when enrollment finishes for a stale owner', async () => {
    let resolveCreate!: (value: {
      bot: string;
      displayName: string;
      createdAt: number;
      backupConfirmedAt: null;
      verified: boolean;
      phrase: string;
    }) => void;
    mocks.create.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { result, rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    act(() => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, 'Pubchi');
    });
    const submission = result.current.submit();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());

    mocks.owner = null;
    rerender();
    await act(async () => {
      resolveCreate({
        bot: OWNER,
        displayName: 'Stale',
        createdAt: 1,
        backupConfirmedAt: null,
        verified: true,
        phrase: 'phrase',
      });
      await submission;
    });

    expect(usePubchiStore.getState().ownerPubky).toBeNull();
    expect(usePubchiStore.getState().pubchi).toBeUndefined();
  });

  it('passes the discovered binding bot through remove before showing success', async () => {
    mocks.reconcile.mockResolvedValue(ACTIVE);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.binding).toEqual(ACTIVE));

    await act(async () => {
      await result.current.remove();
    });

    expect(mocks.remove).toHaveBeenCalledWith({ bot: OWNER });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pubchi bot removed', variant: 'default' }),
    );
  });

  it('does not show removal success when no bot can be resolved', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.remove.mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_NOT_FOUND', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      }),
    );
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.binding).toBeUndefined());

    await act(async () => {
      await result.current.remove();
    });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not remove Pubchi. Try again.', variant: 'error' }),
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Pubchi bot removed' }));
  });

  it('passes the three typed backup words to confirmBackup', async () => {
    const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase,
    });
    mocks.confirm.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: 2,
      verified: true,
    });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, 'Pubchi');
      await result.current.submit();
      result.current.openBackup();
    });

    const words = phrase.split(' ');
    const positions = result.current.backupPositions;
    await act(async () => {
      result.current.backupForm.setValue('wordOne', words[positions[0]!]!);
      result.current.backupForm.setValue('wordTwo', words[positions[1]!]!);
      result.current.backupForm.setValue('wordThree', words[positions[2]!]!);
      await result.current.confirmBackup();
    });

    expect(mocks.confirm).toHaveBeenCalledWith({
      phrase,
      confirmations: positions.map((position) => ({ position, word: words[position] })),
    });
  });

  it('reconciles an existing remote Pubchi when create returns PUBCHI_ALREADY_EXISTS', async () => {
    mocks.reconcile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(ACTIVE);
    mocks.create.mockRejectedValue(
      Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'test',
      }),
    );
    mocks.load.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      bot: OWNER,
      displayName: 'Remote Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce());

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.pubchi).toMatchObject({ bot: OWNER, displayName: 'Remote Pubchi' });
    expect(result.current.binding).toEqual(ACTIVE);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'You already have a Pubchi on this account. It is shown below.' }),
    );
  });

  it('handles a failed PUBCHI_ALREADY_EXISTS recovery without an unhandled rejection', async () => {
    mocks.reconcile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unavailable'));
    mocks.create.mockRejectedValue(
      Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'test',
      }),
    );
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { result } = renderHook(() => usePubchiEnrollment());
      await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce());
      await act(async () => {
        await result.current.submit();
      });
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pubchi could not be loaded', variant: 'error' }),
      );
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.removeListener('unhandledRejection', unhandled);
    }
  });

  it('drops the phrase after three typed-word mismatches', async () => {
    mocks.reconcile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(ACTIVE);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    });
    mocks.confirm.mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'SIGNATURE_INVALID', {
        service: ErrorService.Pubchi,
        operation: 'test',
      }),
    );
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    await act(async () => {
      await result.current.submit();
      result.current.openBackup();
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        result.current.backupForm.setValue('wordOne', 'wrong');
        result.current.backupForm.setValue('wordTwo', 'wrong');
        result.current.backupForm.setValue('wordThree', 'wrong');
        await result.current.confirmBackup();
      });
    }

    expect(result.current.backupOpen).toBe(false);
    expect(result.current.backupController.phraseForConfirmation()).toBeUndefined();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Too many mismatches. The recovery phrase has been cleared.' }),
    );
  });

  it('does not count transport errors toward the phrase lockout', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    });
    mocks.confirm.mockRejectedValue(new Error('homeserver unavailable'));
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    await act(async () => {
      await result.current.submit();
      result.current.openBackup();
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        result.current.backupForm.setValue('wordOne', 'wrong');
        result.current.backupForm.setValue('wordTwo', 'wrong');
        result.current.backupForm.setValue('wordThree', 'wrong');
        await result.current.confirmBackup();
      });
    }

    expect(result.current.backupOpen).toBe(true);
    expect(result.current.backupController.phraseForConfirmation()).toBeDefined();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not verify the recovery phrase. Try again.' }),
    );
  });

  it('surfaces the schema message when create is submitted with an empty name', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    void result.current.form.formState.errors;
    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, '');
      await expect(result.current.submit()).resolves.toBe(false);
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors[ENROLL_FORM_FIELDS.DISPLAY_NAME]?.message).toBe('Enter a name.');
  });

  it('rejects secret-shaped names with the public-state message', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    void result.current.form.formState.errors;
    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, 'sk-abcdefghijklmnop');
      await expect(result.current.submit()).resolves.toBe(false);
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors[ENROLL_FORM_FIELDS.DISPLAY_NAME]?.message).toBe(
      'That looks like a secret or recovery phrase. Bot state is public — choose something else.',
    );
  });

  it.each(['owner', 'generation', 'response owner'] as const)(
    'ignores an old preferences callback after %s changes',
    async (change) => {
      mocks.reconcile.mockResolvedValue(undefined);
      const { result } = renderHook(() => usePubchiEnrollment());
      await waitFor(() => expect(result.current.enrollmentLoaded).toBe(true));
      const accept = result.current.acceptSavedConfig;
      if (change === 'owner') mocks.owner = 'c'.repeat(52);
      if (change === 'generation') mocks.generation = 'second';
      const current = { ...CONFIG, owner: mocks.owner!, display_name: 'Current settings' };
      usePubchiStore.getState().setConfig(current, mocks.owner);

      act(() => accept(change === 'response owner' ? { ...CONFIG, owner: 'c'.repeat(52) } : CONFIG));

      expect(usePubchiStore.getState().ownerPubky).toBe(mocks.owner);
      expect(usePubchiStore.getState().config).toBe(current);
    },
  );

  it('does not ask a root /:rw session to re-approve Ring', async () => {
    mocks.capabilities = ['/:rw'];
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    expect(result.current.needsReapproval).toBe(false);
  });

  it('asks a Ring-default /pub/pubky.app/:rw session to re-approve', async () => {
    mocks.capabilities = ['/pub/pubky.app/:rw'];
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    expect(result.current.needsReapproval).toBe(true);
  });

  it('refreshes device readiness without opening Ring when capabilities are already granted', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue(null);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    mocks.ensureDeviceReady.mockClear();

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
    });

    expect(openSpy).not.toHaveBeenCalled();
    expect(mocks.adopt).not.toHaveBeenCalled();
    expect(mocks.ensureDeviceReady).toHaveBeenCalled();
  });

  it('adopts a successful Ring approval via adoptCapabilityApproval', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockResolvedValue(undefined);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
    });

    expect(openSpy).toHaveBeenCalledWith('pubkyauth://cap', '_blank', 'noopener,noreferrer');
    expect(mocks.adopt).toHaveBeenCalledWith(session);
    expect(cancel).toHaveBeenCalled();
  });

  it('adopts a resolved dialog approval through the real enrollment hook', async () => {
    let resolveApproval!: (session: Session) => void;
    let reapproval!: Promise<boolean>;
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise<Session>((resolve) => {
        resolveApproval = resolve;
      }),
      cancelAuthFlow: vi.fn(),
    });
    mocks.adopt.mockResolvedValue(undefined);

    function ApprovalDialogWithEnrollment() {
      const { reapprove } = usePubchiEnrollment();
      return createElement(RingApprovalDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onApproved: (session) => {
          reapproval = reapprove(session);
          return reapproval;
        },
      });
    }

    render(createElement(ApprovalDialogWithEnrollment));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Authorize with Pubky Ring' })).toBeInTheDocument());

    const session = { info: { publicKey: { z32: () => OWNER } } } as Session;
    act(() => {
      resolveApproval(session);
    });

    await waitFor(() => expect(reapproval).toBeDefined());
    await expect(reapproval).resolves.toBe(true);
    expect(mocks.adopt).toHaveBeenCalledTimes(1);
    expect(mocks.adopt).toHaveBeenCalledWith(session);
  });

  it('discards a cancelled dialog approval through the real enrollment hook', async () => {
    let resolveApproval!: (session: Session) => void;
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise<Session>((resolve) => {
        resolveApproval = resolve;
      }),
      cancelAuthFlow: vi.fn(),
    });

    function ApprovalDialogWithEnrollment() {
      const { reapprove } = usePubchiEnrollment();
      return createElement(RingApprovalDialog, { open: true, onOpenChange: vi.fn(), onApproved: reapprove });
    }

    render(createElement(ApprovalDialogWithEnrollment));
    await waitFor(() => expect(screen.getByTestId('pubchi-reapprove-cancel')).toBeInTheDocument());
    screen.getByTestId('pubchi-reapprove-cancel').click();
    resolveApproval({ info: { publicKey: { z32: () => OWNER } } } as Session);

    await waitFor(() => expect(mocks.adopt).not.toHaveBeenCalled());
  });

  it('shares one in-flight approval when reapprove is called twice', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    let resolveApproval!: (value: typeof session) => void;
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise((resolve) => {
        resolveApproval = resolve;
      }),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.reapprove();
      second = result.current.reapprove();
    });
    await waitFor(() => expect(mocks.getUrl).toHaveBeenCalledOnce());
    resolveApproval(session);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(mocks.adopt).toHaveBeenCalledOnce();
  });

  it('adopts a narrower same-identity approval because it already replaced the browser cookie', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
    });

    expect(mocks.adopt).toHaveBeenCalledWith(session);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('leaves failed Ring adoption feedback to the approval dialog', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: vi.fn(),
    });
    mocks.adopt.mockRejectedValue(new Error('adoption failed'));
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(false);
    });

    expect(mocks.adopt).toHaveBeenCalledWith(session);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('clears degraded state after re-approving with Pubchi coverage', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    mocks.capabilities = ['/pub/pubky.app/:rw'];
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockImplementation(async () => {
      mocks.capabilities = ['/pub/pubky.app/:rw', '/pub/app.pubchi/v1/:rw'];
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result, rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.needsReapproval).toBe(true));

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
      rerender();
    });

    expect(result.current.needsReapproval).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it('calls cancel when the approval times out', async () => {
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockImplementation(async () => ({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise((_, reject) => {
        queueMicrotask(() => reject(new Error('Auth flow timed out after maximum attempts')));
      }),
      cancelAuthFlow: cancel,
    }));
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(false);
    });

    expect(cancel).toHaveBeenCalled();
    expect(mocks.adopt).not.toHaveBeenCalled();
  });

  it('ignores a late approval after cancellation', async () => {
    const cancel = vi.fn();
    let resolveApproval!: (value: unknown) => void;
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise((resolve) => {
        resolveApproval = resolve;
      }),
      cancelAuthFlow: cancel,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    act(() => {
      void result.current.reapprove();
    });
    await waitFor(() => expect(mocks.getUrl).toHaveBeenCalled());

    act(() => {
      result.current.cancelReapproval();
    });
    expect(cancel).toHaveBeenCalled();

    resolveApproval({ info: { publicKey: { z32: () => OWNER } } });
    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(false);
    });
    expect(mocks.adopt).not.toHaveBeenCalled();
  });

  it('discards an approval when the signed-in owner changes mid-flight', async () => {
    const cancel = vi.fn();
    let resolveApproval!: (value: unknown) => void;
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise((resolve) => {
        resolveApproval = resolve;
      }),
      cancelAuthFlow: cancel,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    let approval!: Promise<boolean>;
    act(() => {
      approval = result.current.reapprove();
    });
    await waitFor(() => expect(mocks.getUrl).toHaveBeenCalled());

    mocks.owner = 'o15w7hmw9dku6r671xuuon6n9drrih4m18gh3d6ayft5z3gq8i3o';
    resolveApproval({ info: { publicKey: { z32: () => OWNER } } });

    await expect(approval).resolves.toBe(false);
    expect(mocks.adopt).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('does not toast when the approval flow is canceled on unmount', async () => {
    let rejectApproval!: (error: Error) => void;
    const cancel = vi.fn(() => {
      const error = new Error('Auth flow canceled');
      error.name = 'AuthFlowCanceled';
      rejectApproval(error);
    });
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise((_, reject) => {
        rejectApproval = reject;
      }),
      cancelAuthFlow: cancel,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result, unmount } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    let approval!: Promise<boolean>;
    act(() => {
      approval = result.current.reapprove();
    });
    await waitFor(() => expect(mocks.getUrl).toHaveBeenCalled());
    unmount();

    await act(async () => {
      await expect(approval).resolves.toBe(false);
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
