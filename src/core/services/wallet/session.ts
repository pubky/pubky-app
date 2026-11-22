import {
  type Activity,
  type ElectrumServer,
  EmbeddedWalletClient,
  type Network,
  parsePayment,
  type ReceiveQuote,
  type ReceiveRequest,
  type SendResult,
  type SendReview,
  WalletError,
} from '@beignet/wallet-core';
import { useAuthStore } from '@/stores/auth/auth.store';

// The dedicated wallet worker sanitizes messages for this operation before replying.
export class WalletHandoffImportError extends Error {}
const handoffImportCodes = new Set([
  'WALLET_HANDOFF_INVALID',
  'WALLET_HANDOFF_PENDING',
  'WALLET_CLOSE_UNCERTAIN',
  'WALLET_CONFIGURATION',
  'WALLET_BUSY',
  'WALLET_CLOSED',
  'WALLET_STORAGE',
]);

export type PrimaryConnectionIssue =
  | 'ownership-pending'
  | 'ownership-changed'
  | 'handshake-timeout'
  | 'handshake-closed'
  | 'protocol-mismatch'
  | 'relay-unavailable';
export type OfflineReceiveDraft = { id: string; amountSats: number; description: string; peer?: string };
export type WalletDefaults = { network: Network; primaryUri: string; electrum: ElectrumServer };
export type LocalUnlockScope = { network: Network; deviceId: string };
export type LocalRingUnlock = LocalUnlockScope & { passwordAvailable: boolean };
export type ChannelBalanceHold = 'imported-held' | 'funding-missing' | 'held';
export type LastWalletBalance = { walletId: string; network: Network; totalSats: number; updatedAt: number };
type UnlockedEvent = { id: number; event: 'unlocked'; account: string; balance: LastWalletBalance | null };
type PrimaryChangeEvent = { event: 'primary-change'; account: string };
export type WalletStartProgress = { phase: 'opening' | 'scanning' | 'finishing'; primaryConnected: boolean };
type StartProgressEvent = { id: number; event: 'start-progress' } & WalletStartProgress;
type Reply = { id: number; result?: unknown; error?: { code?: string; status?: number; message: string } };

// A same-tab remount can begin while its previous worker is still flushing.
const pendingClosures = new Map<string, Promise<void>>();
const locked = () => Object.assign(new Error('The wallet is locked.'), { code: 'WALLET_CLOSED' });

/** One signed-in account, with the worker owning the exclusive vault lease. */
export class WalletSession {
  readonly client: EmbeddedWalletClient;
  private worker?: Worker;
  private counter = 0;
  private closing = false;
  private offlineOperation = false;
  private closeAttempt?: Promise<void>;
  private assertRingDevice?: () => void;
  private readonly ownsAccount: () => boolean;
  private readonly primaryListeners = new Set<() => void>();
  private pending = new Map<
    number,
    {
      operation: string;
      resolve(value: unknown): void;
      reject(error: Error): void;
      notifyUnlocked?: boolean;
      startWalletId?: string;
    }
  >();

  constructor(
    private readonly account: string,
    private readonly onUnlocked?: (lastBalance: LastWalletBalance | null) => void,
    private readonly onStartProgress?: (progress: WalletStartProgress) => void,
  ) {
    const { session, generation } = useAuthStore.getState();
    this.ownsAccount = () => {
      const state = useAuthStore.getState();
      return (
        !!session &&
        state.session === session &&
        state.currentUserPubky === account &&
        state.generation === generation &&
        !state.isLoggingOut &&
        !state.needsAccountSync
      );
    };
    this.worker = new Worker('/wallet-engine/worker.js', { type: 'module', name: 'Pubky wallet' });
    this.worker.onmessage = ({
      data,
    }: MessageEvent<Reply | UnlockedEvent | PrimaryChangeEvent | StartProgressEvent>) => {
      if ('event' in data && data.event === 'primary-change') {
        if (data.account !== this.account) return;
        try {
          this.selectedWallet();
        } catch {
          return;
        }
        for (const listener of this.primaryListeners) listener();
        return;
      }
      const waiter = this.pending.get(data.id);
      if (!waiter) return;
      if ('event' in data) {
        if (data.event === 'start-progress' && waiter.startWalletId) {
          try {
            this.selectedWallet(waiter.startWalletId);
          } catch {
            return;
          }
          if (['opening', 'scanning', 'finishing'].includes(data.phase) && typeof data.primaryConnected === 'boolean')
            this.onStartProgress?.({ phase: data.phase, primaryConnected: data.primaryConnected });
          return;
        }
        if (
          waiter.notifyUnlocked &&
          data.event === 'unlocked' &&
          data.account === this.account &&
          !this.closing &&
          this.ownsAccount()
        ) {
          waiter.notifyUnlocked = false;
          this.onUnlocked?.(data.balance);
        }
        return;
      }
      this.pending.delete(data.id);
      if (waiter.operation !== 'close' && (this.closing || !this.ownsAccount())) {
        waiter.reject(locked());
      } else if (data.error) {
        const { code, status, message } = data.error;
        const failure =
          waiter.operation === 'handoff-import' && code && handoffImportCodes.has(code)
            ? new WalletHandoffImportError(message)
            : new Error(message);
        waiter.reject(Object.assign(failure, { code, status }));
      } else waiter.resolve(data.result);
      if (data.error?.code === 'WALLET_CLOSE_UNCERTAIN') this.dispose(locked());
    };
    this.worker.onerror = () => this.dispose(new Error('The wallet worker stopped. Reopen the wallet.'));
    this.worker.onmessageerror = () => this.dispose(new Error('The wallet worker could not read the request.'));
    this.client = new EmbeddedWalletClient({
      runtime: { request: (input) => this.call('request', input), close: () => this.closeWorker() },
      store: {
        load: (walletId) => this.call<Activity[] | null>('load-activity', { walletId }),
        save: (walletId, rows) => this.call<void>('save-activity', { walletId, rows }),
      },
    });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    void this.call('visibility', document.hidden).catch(() => {});
  };

  /** The UI installs the verified homeserver lease before starting its Ring-bound wallet. */
  guardRingDevice(assertActive: () => void) {
    this.assertRingDevice = assertActive;
  }

  onPrimaryChange(listener: () => void): () => void {
    this.primaryListeners.add(listener);
    return () => {
      this.primaryListeners.delete(listener);
    };
  }

  private call<T>(operation: string, payload?: unknown, transfer: Transferable[] = []): Promise<T> {
    const worker = this.worker;
    if (!worker || (operation !== 'close' && (this.closing || !this.ownsAccount()))) return Promise.reject(locked());
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const notifyUnlocked = (operation === 'open' || operation === 'open-with-ring') && !!this.onUnlocked;
      const input = payload as { method?: string; path?: string } | undefined;
      const selected = this.onStartProgress && operation === 'request' ? this.client.connection.walletId : undefined;
      const startWalletId =
        selected && input?.method === 'POST' && input.path === `/api/wallets/${selected}/start` ? selected : undefined;
      this.pending.set(id, {
        operation,
        resolve: (value) => resolve(value as T),
        reject,
        notifyUnlocked,
        startWalletId,
      });
      try {
        if (this.assertRingDevice && (operation === 'ring-wallet' || operation === 'request')) {
          const input = payload as { method?: string; path?: string };
          const discovery =
            operation === 'request' &&
            (input.method ?? 'GET') === 'GET' &&
            (input.path === '/api/wallets' || input.path === '/api/config');
          if (!discovery) this.assertRingDevice();
        }
        worker.postMessage(
          {
            id,
            operation,
            account: this.account,
            payload,
            ...(notifyUnlocked ? { notifyUnlocked } : {}),
            ...(startWalletId ? { notifyStartProgress: true } : {}),
          },
          transfer,
        );
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async inspect() {
    await pendingClosures.get(this.account)?.catch(() => {});
    this.onVisibility();
    return this.call<{
      exists: boolean;
      interrupted?: boolean;
      paymentNeedsReview?: boolean;
      ringUnlock?: LocalRingUnlock;
    }>('inspect');
  }

  async open(password: string) {
    // Request persistent storage from the explicit unlock/create gesture.
    // Browsers may decline; keys still use the same durable OPFS storage.
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
    await pendingClosures.get(this.account)?.catch(() => {});
    this.onVisibility();
    return this.call<WalletDefaults>('open', password);
  }

  async prepareLocalUnlock(): Promise<LocalUnlockScope> {
    await pendingClosures.get(this.account)?.catch(() => {});
    if (!this.ownsAccount()) throw locked();
    this.assertRingDevice?.();
    return this.call('prepare-local-unlock');
  }

  async openWithRing(key: Uint8Array, scope: LocalUnlockScope, create = false): Promise<WalletDefaults> {
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
    await pendingClosures.get(this.account)?.catch(() => {});
    this.onVisibility();
    return this.withRingKey(key, 'open-with-ring', { network: scope.network, deviceId: scope.deviceId, create });
  }

  async enrollLocalUnlock(key: Uint8Array, scope: LocalUnlockScope): Promise<LocalRingUnlock> {
    try {
      this.assertRingDevice?.();
      return await this.withRingKey(key, 'enroll-local-unlock', { network: scope.network, deviceId: scope.deviceId });
    } finally {
      if (key.byteLength) key.fill(0);
    }
  }

  async newBitcoinAddress(network: Network): Promise<string> {
    const id = this.client.connection.walletId;
    if (!id) throw locked();
    const { address } = await this.call<{ address: string }>('request', {
      method: 'POST',
      path: `/wallets/${id}/api/address/new`,
      body: {},
    });
    const parsed = parsePayment(address, { network });
    if (parsed.kind !== 'onchain' || parsed.address !== address) {
      throw new WalletError('The wallet could not verify its receive address.', 'INVALID_ADDRESS');
    }
    return address;
  }

  async rememberBalance(walletId: string, network: Network, totalSats: number): Promise<void> {
    if (!this.ownsAccount() || this.client.connection.walletId !== walletId) throw locked();
    this.assertRingDevice?.();
    await this.call('remember-balance', { walletId, network, totalSats });
  }

  private selectedWallet(expected?: string): string {
    const id = this.client.connection.walletId;
    if (!id || (expected !== undefined && expected !== id) || this.closing || !this.ownsAccount()) throw locked();
    this.assertRingDevice?.();
    return id;
  }

  async primaryConnectionIssue(walletId: string): Promise<PrimaryConnectionIssue | null> {
    this.selectedWallet(walletId);
    const issue = await this.call<PrimaryConnectionIssue | null>('primary-connection-issue', { walletId });
    this.selectedWallet(walletId);
    return issue;
  }

  /** The snapshot's single hold note also includes resolved channels. Only inspect the local rows when it appears. */
  async channelBalanceHold(walletId: string): Promise<ChannelBalanceHold | null> {
    this.selectedWallet(walletId);
    const rows = await this.call<{ state: string; restoreRecencyUnproven?: boolean; fundingUnaccounted?: boolean }[]>(
      'request',
      { method: 'GET', path: `/wallets/${encodeURIComponent(walletId)}/api/channels` },
    );
    this.selectedWallet(walletId);
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.state !== 'string')) return 'held';
    const live = rows.filter((row) => !['CLOSED', 'FORCE_CLOSED', 'DROPPED'].includes(row.state));
    if (live.some((row) => row.restoreRecencyUnproven === true)) return 'imported-held';
    if (live.some((row) => row.fundingUnaccounted === true)) return 'funding-missing';
    return null;
  }

  /** Read completed receipts from the unlocked vault before the first live snapshot. */
  async savedActivity(walletId: string): Promise<Activity[]> {
    this.selectedWallet(walletId);
    // The pinned client uses this local-only loader to validate stored receipts
    // before merging them with live activity. An older client can omit it.
    const client = this.client as EmbeddedWalletClient & {
      _ledgerFor?: (id: string) => Promise<Map<string, Activity>>;
    };
    if (!client._ledgerFor) return [];
    if (!this.assertRingDevice && (await this.ringBinding())) throw locked();
    this.selectedWallet(walletId);
    const ledger = await client._ledgerFor(walletId);
    this.selectedWallet(walletId);
    return structuredClone(
      [...ledger.values()]
        .filter((row) => row.status === 'completed')
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20),
    );
  }

  async loadOfflineReceiveDraft(): Promise<OfflineReceiveDraft | null> {
    const walletId = this.selectedWallet();
    const draft = await this.call<OfflineReceiveDraft | null>('offline-draft', { walletId });
    this.selectedWallet(walletId);
    return draft;
  }

  async receive(quote: ReceiveQuote): Promise<ReceiveRequest> {
    const walletId = this.selectedWallet();
    if (quote.mode !== 'offline') return this.client.receive(quote);
    if (this.offlineOperation) throw new WalletError('An offline request is being prepared.', 'RECEIVE_BUSY');
    this.offlineOperation = true;
    try {
      await this.call('begin-offline-receive', { walletId, draft: quote });
      this.selectedWallet(walletId);
      const request = await this.client.receive(quote);
      this.selectedWallet(walletId);
      await this.call('finish-offline-receive', { walletId, request });
      this.selectedWallet(walletId);
      return request;
    } finally {
      this.offlineOperation = false;
    }
  }

  async discardOfflineReceiveDraft(id: string): Promise<void> {
    const walletId = this.selectedWallet();
    if (this.offlineOperation) throw new WalletError('An offline request is being prepared.', 'RECEIVE_BUSY');
    this.offlineOperation = true;
    try {
      const [registry, reservations] = await Promise.all([
        this.call<{ requests: ReceiveRequest[] }>('request', {
          method: 'GET',
          path: `/wallets/${walletId}/api/receive/requests`,
        }),
        this.call<{ requests: { id: string; channelId?: string; done?: boolean }[] }>('request', {
          method: 'GET',
          path: `/wallets/${walletId}/api/receive/offline`,
        }),
      ]);
      this.selectedWallet(walletId);
      if (!Array.isArray(registry?.requests) || !Array.isArray(reservations?.requests))
        throw new WalletError('Reconnect to check the saved offline request.', 'RECEIVE_UNAVAILABLE');
      const saved = registry.requests.find((request) => request.id === id);
      if (saved) {
        // Registered invoices remain payable and visible in Activity. Preserve their receipt tracking.
        await this.call('finish-offline-receive', { walletId, request: saved });
        return;
      }
      if (reservations.requests.some((job) => job.id === id && job.channelId && !job.done))
        throw new WalletError(
          'This reservation is still active. Resume the saved request or wait for it to finish.',
          'RECEIVE_PENDING',
        );
      await this.call('discard-offline-draft', { walletId, id });
    } finally {
      this.offlineOperation = false;
    }
  }

  async awayReceipts(walletId: string, activity: Activity[], primaryConnected: boolean): Promise<string[]> {
    if (!this.ownsAccount() || this.client.connection.walletId !== walletId) throw locked();
    this.assertRingDevice?.();
    const rows = activity.filter((row) => row.receiveRequest?.offlineReceive === true);
    return this.call('away-receipts', { walletId, rows, primaryConnected });
  }

  async send(review: SendReview): Promise<SendResult> {
    if (!this.ownsAccount()) throw locked();
    this.assertRingDevice?.();
    await this.call('begin-send');
    let status: SendResult['status'] = 'uncertain';
    try {
      if (!this.ownsAccount() || this.closing) {
        status = 'failed';
        throw locked();
      }
      const result = await this.client.send(review);
      status = result.status;
      return result;
    } catch (error) {
      if (error instanceof WalletError && ['INVALID_REVIEW', 'REVIEW_CHANGED', 'QUOTE_EXPIRED'].includes(error.code)) {
        status = 'failed';
      }
      throw error;
    } finally {
      // Losing the worker here leaves the marker for the next unlock. Preserve
      // the payment's actual outcome even if clearing its marker fails.
      await this.call('finish-send', status).catch(() => {});
    }
  }

  async activityIncludesChannelSends(rows: Activity[]): Promise<boolean> {
    const id = this.client.connection.walletId;
    if (!id || !this.ownsAccount()) throw locked();
    // The snapshot requires the payment, transaction and submission journals.
    // Its optional composite channel-send list can fall back to an empty list.
    const sends = await this.call<{ kind: string; id: string; stage: string }[]>('request', {
      method: 'GET',
      path: `/wallets/${id}/api/channel-send/list`,
    });
    return (
      Array.isArray(sends) &&
      sends.every(
        (send) =>
          send &&
          (send.kind === 'single' ||
            (send.kind === 'composite' &&
              typeof send.id === 'string' &&
              send.id.length > 0 &&
              typeof send.stage === 'string' &&
              rows.some(
                (row) => row.kind === 'sent' && row.channelSend?.id === send.id && row.channelSend.stage === send.stage,
              ))),
      )
    );
  }

  async acknowledgePayment(kind: 'legacy' | 'payment'): Promise<void> {
    if (!this.ownsAccount()) throw locked();
    this.assertRingDevice?.();
    await this.call('acknowledge-payment', kind);
  }

  ringDeviceId(): Promise<string> {
    return this.call('ring-device');
  }

  ringBinding(): Promise<{
    deviceId: string;
    network: Network;
    transferId?: string;
    mode?: 'create' | 'restore';
  } | null> {
    return this.call('ring-binding');
  }

  /** Only an isolated buffer is transferred; the SDK may store the original view in shared WASM memory. */
  private async withRingKey<T>(
    key: Uint8Array,
    operation: string,
    fields: Record<string, unknown>,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (!(key instanceof Uint8Array) || key.length !== 32) {
      if (key instanceof Uint8Array) key.fill(0);
      throw new WalletError('Ring returned an invalid wallet key.', 'WALLET_RING_KEY');
    }
    const owned = new Uint8Array(key);
    key.fill(0);
    if (!this.ownsAccount()) {
      owned.fill(0);
      throw locked();
    }
    const result = this.call<T>(operation, { ...fields, key: owned }, [owned.buffer, ...transfer]);
    // A successful transfer detaches the sender. Closed workers and failed postMessage calls keep ownership.
    if (owned.byteLength) owned.fill(0);
    return result;
  }

  createRingWallet(key: Uint8Array, network: Network, mode: 'create' | 'restore') {
    return this.withRingKey<{ id: string; network: Network }>(key, 'ring-wallet', { network, mode });
  }

  prepareHandoff(network: Network) {
    const walletId = this.selectedWallet();
    if (!this.assertRingDevice || this.offlineOperation) throw locked();
    return this.call<{ deviceId: string; transferId?: string }>('prepare-handoff', { walletId, network });
  }

  exportHandoff(key: Uint8Array, network: Network, transferId: string, sourceDeviceId: string) {
    this.selectedWallet();
    if (!this.assertRingDevice || this.offlineOperation) throw locked();
    this.assertRingDevice();
    return this.withRingKey<Uint8Array>(key, 'handoff-export', { network, transferId, sourceDeviceId });
  }

  importHandoff(
    key: Uint8Array,
    network: Network,
    transferId: string,
    sourceDeviceId: string,
    targetDeviceId: string,
    envelope: Uint8Array,
  ) {
    return this.withRingKey<{ id: string; network: Network; deviceId: string }>(
      key,
      'handoff-import',
      { network, transferId, sourceDeviceId, targetDeviceId, envelope },
      [envelope.buffer as ArrayBuffer],
    );
  }

  close(): Promise<void> {
    this.closing = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    return this.client.close();
  }

  private closeWorker(): Promise<void> {
    if (this.closeAttempt) return this.closeAttempt;
    if (!this.worker) return Promise.resolve();
    const previous = pendingClosures.get(this.account);
    const closing = Promise.all([previous?.catch(() => {}), this.call('close')])
      .then(() => undefined)
      .finally(() => {
        this.dispose(locked());
        if (pendingClosures.get(this.account) === closing) pendingClosures.delete(this.account);
      });
    pendingClosures.set(this.account, closing);
    this.closeAttempt = closing;
    return closing;
  }

  private dispose(error: Error) {
    this.primaryListeners.clear();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.worker?.terminate();
    this.worker = undefined;
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}
