import { type Activity, type ElectrumServer, EmbeddedWalletClient, type Network } from '@beignet/wallet-core';

export type WalletDefaults = { network: Network; primaryUri: string; electrum: ElectrumServer };
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
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor(private readonly account: string) {
    this.worker = new Worker('/wallet-engine/worker.js', { type: 'module', name: 'Pubky wallet' });
    this.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const waiter = this.pending.get(data.id);
      if (!waiter) return;
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

  private call<T>(operation: string, payload?: unknown): Promise<T> {
    const worker = this.worker;
    if (!worker || (this.closing && operation !== 'close')) return Promise.reject(locked());
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      try {
        worker.postMessage({ id, operation, account: this.account, payload });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async inspect() {
    await pendingClosures.get(this.account)?.catch(() => {});
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
