import {
  type Activity,
  type ElectrumServer,
  EmbeddedWalletClient,
  type Network,
  parsePayment,
  WalletError,
} from '@beignet/wallet-core';
import { useAuthStore } from '@/stores/auth/auth.store';

export type WalletDefaults = { network: Network; primaryUri: string; electrum: ElectrumServer };
export type LastWalletBalance = { walletId: string; network: Network; totalSats: number; updatedAt: number };
type UnlockedEvent = { id: number; event: 'unlocked'; account: string; balance: LastWalletBalance | null };
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
  private closeAttempt?: Promise<void>;
  private assertRingDevice?: () => void;
  private readonly ownsAccount: () => boolean;
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void; notifyUnlocked?: boolean }
  >();

  constructor(
    private readonly account: string,
    private readonly onUnlocked?: (lastBalance: LastWalletBalance | null) => void,
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
    this.worker.onmessage = ({ data }: MessageEvent<Reply | UnlockedEvent>) => {
      const waiter = this.pending.get(data.id);
      if (!waiter) return;
      if ('event' in data) {
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
      if (data.error)
        waiter.reject(
          Object.assign(new Error(data.error.message), { code: data.error.code, status: data.error.status }),
        );
      else waiter.resolve(data.result);
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

  private call<T>(operation: string, payload?: unknown, transfer: Transferable[] = []): Promise<T> {
    const worker = this.worker;
    if (!worker || (this.closing && operation !== 'close')) return Promise.reject(locked());
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const notifyUnlocked = operation === 'open' && !!this.onUnlocked;
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, notifyUnlocked });
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
          { id, operation, account: this.account, payload, ...(notifyUnlocked ? { notifyUnlocked } : {}) },
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
    return this.call<{ exists: boolean; interrupted?: boolean }>('inspect');
  }

  async open(password: string) {
    // Request persistent storage from the explicit unlock/create gesture.
    // Browsers may decline; keys still use the same durable OPFS storage.
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
    await pendingClosures.get(this.account)?.catch(() => {});
    this.onVisibility();
    return this.call<WalletDefaults>('open', password);
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

  ringDeviceId(): Promise<string> {
    return this.call('ring-device');
  }

  ringBinding(): Promise<{ deviceId: string; network: Network } | null> {
    return this.call('ring-binding');
  }

  /** Consumes the SDK's scoped key. Transfer a dedicated buffer so a WASM-backed view cannot detach other keys. */
  async createRingWallet(
    key: Uint8Array,
    network: Network,
    mode: 'create' | 'restore',
  ): Promise<{ id: string; network: Network }> {
    if (!(key instanceof Uint8Array) || key.length !== 32) {
      if (key instanceof Uint8Array) key.fill(0);
      throw new WalletError('Ring returned an invalid wallet key.', 'WALLET_RING_KEY');
    }
    const owned = new Uint8Array(key);
    key.fill(0);
    const result = this.call<{ id: string; network: Network }>('ring-wallet', { key: owned, network, mode }, [
      owned.buffer,
    ]);
    // A successful transfer detaches the sender. Closed workers and failed postMessage calls keep ownership.
    if (owned.byteLength) owned.fill(0);
    return result;
  }

  close(): Promise<void> {
    this.closing = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    return this.client.close();
  }

  private closeWorker(): Promise<void> {
    if (!this.worker) return Promise.resolve();
    if (!this.closeAttempt) {
      const previous = pendingClosures.get(this.account);
      const closing = Promise.all([previous?.catch(() => {}), this.call('close')])
        .then(() => undefined)
        .finally(() => {
          this.dispose(locked());
          if (pendingClosures.get(this.account) === closing) pendingClosures.delete(this.account);
          this.closeAttempt = undefined;
        });
      pendingClosures.set(this.account, closing);
      this.closeAttempt = closing;
    }
    return this.closeAttempt;
  }

  private dispose(error: Error) {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.worker?.terminate();
    this.worker = undefined;
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}
