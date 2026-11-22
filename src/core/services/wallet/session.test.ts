import { type ReceiveQuote, type ReceiveRequest, type SendReview, WalletError } from '@beignet/wallet-core';
import { afterEach, expect, it, vi } from 'vitest';
import { WalletHandoffImportError, WalletSession } from './session';

type Request = { id: number; operation: string };

const auth = vi.hoisted(() => ({
  session: {} as object | null,
  generation: 'original',
  currentUserPubky: 'y'.repeat(52),
  isLoggingOut: false,
  needsAccountSync: false,
}));
vi.mock('@/stores/auth/auth.store', () => ({ useAuthStore: { getState: () => auth } }));

afterEach(() => vi.unstubAllGlobals());

it.each([
  { rows: [{ state: 'NORMAL', fundingUnaccounted: true }], expected: 'funding-missing' },
  { rows: [{ state: 'AWAITING_REESTABLISH', restoreRecencyUnproven: true }], expected: 'imported-held' },
  {
    rows: ['CLOSED', 'DROPPED', 'FORCE_CLOSED'].map((state) => ({ state, restoreRecencyUnproven: true })),
    expected: null,
  },
  { rows: [{ state: 'NORMAL' }], expected: null },
  { rows: [{}], expected: 'held' },
])('projects the current wallet’s local channel rows into a balance hold ($expected)', async ({ rows, expected }) => {
  const walletId = 'a'.repeat(32);
  const channelPath = `/wallets/${walletId}/api/channels`;
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    postMessage(request: Request & { payload?: { path?: string } }) {
      const result = request.payload?.path === channelPath ? rows : null;
      this.onmessage?.({ data: { id: request.id, result } });
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const session = new WalletSession(auth.currentUserPubky);
  session.client.selectWallet(walletId);
  await expect(session.channelBalanceHold(walletId)).resolves.toBe(expected);
  await expect(session.channelBalanceHold('b'.repeat(32))).rejects.toMatchObject({ code: 'WALLET_CLOSED' });
  await session.close();
});

it('waits for the durable send marker and clears it only for known outcomes', async () => {
  const operations: unknown[] = [];
  let accept!: () => void;
  const write = new Promise<void>((resolve) => {
    accept = resolve;
  });
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    async postMessage(request: Request & { payload?: unknown }) {
      operations.push([request.operation, request.payload]);
      if (request.operation === 'begin-send') await write;
      this.onmessage?.({ data: { id: request.id, result: null } });
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const session = new WalletSession(auth.currentUserPubky);
  const review: SendReview = {
    id: 'a',
    destination: 'test',
    description: '',
    amountSats: 1,
    feeSats: 0,
    feeLabel: 'Fee',
    totalSats: 1,
    route: 'lightning',
    expiresAt: Date.now() + 60000,
    warnings: [],
  };
  const result = { id: 'a', status: 'completed' as const, amountSats: 1, feeSats: 0, message: 'Sent' };
  const send = vi.spyOn(session.client, 'send').mockResolvedValueOnce(result);
  const payment = session.send(review);
  expect(operations).toEqual([['begin-send', undefined]]);
  expect(send).not.toHaveBeenCalled();
  accept();
  expect(await payment).toEqual(result);
  expect(operations.at(-1)).toEqual(['finish-send', 'completed']);
  send.mockRejectedValueOnce(new Error('lost result'));
  await expect(session.send(review)).rejects.toThrow('lost result');
  expect(operations.at(-1)).toEqual(['finish-send', 'uncertain']);
  send.mockRejectedValueOnce(new WalletError('expired', 'QUOTE_EXPIRED'));
  await expect(session.send(review)).rejects.toThrow('expired');
  expect(operations.at(-1)).toEqual(['finish-send', 'failed']);
  await session.close();
});

it('marks only recognized worker replies to the pending import as handoff explanations', async () => {
  const details = { code: 'WALLET_HANDOFF_INVALID', message: 'The saved wallet transfer could not be verified.' };
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    postMessage(request: Request) {
      this.onmessage?.({ data: { id: request.id, ...(request.operation === 'close' ? {} : { error: details }) } });
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const session = new WalletSession(auth.currentUserPubky);
  const install = () =>
    session.importHandoff(new Uint8Array(32), 'regtest', 'transfer', 'source', 'destination', Uint8Array.of(1));
  await expect(install()).rejects.toBeInstanceOf(WalletHandoffImportError);
  await expect(session.ringBinding()).rejects.not.toBeInstanceOf(WalletHandoffImportError);
  details.code = 'UNKNOWN_CODE';
  details.message = 'private diagnostic';
  await expect(install()).rejects.not.toBeInstanceOf(WalletHandoffImportError);
  await session.close();
});

it('fences a failed worker and verifies the stored state before reopening the same account', async () => {
  const workers: TestWorker[] = [];
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    postMessage = vi.fn<(request: Request) => void>();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
    reply(request: Request, payload: object) {
      this.onmessage?.({ data: { id: request.id, ...payload } });
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  const account = 'y'.repeat(52);
  const old = new WalletSession(account);
  const closing = old.close();
  const fresh = new WalletSession(account);
  const inspected = fresh.inspect();
  expect(workers[1].postMessage).not.toHaveBeenCalled();

  const lastRequest = (worker: TestWorker) => worker.postMessage.mock.lastCall![0];
  workers[0].reply(lastRequest(workers[0]), {
    error: { code: 'WALLET_CLOSE_UNCERTAIN', message: 'The last write could not be confirmed.' },
  });
  await expect(closing).rejects.toMatchObject({ code: 'WALLET_CLOSE_UNCERTAIN' });
  await expect(old.close()).rejects.toMatchObject({ code: 'WALLET_CLOSE_UNCERTAIN' });
  expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(workers[1].postMessage).toHaveBeenCalled());
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  expect(lastRequest(workers[1]).operation).toBe('inspect');
  workers[1].reply(lastRequest(workers[1]), { result: { exists: true, interrupted: true } });
  await expect(inspected).resolves.toEqual({ exists: true, interrupted: true });

  const closingFresh = fresh.close();
  workers[1].reply(lastRequest(workers[1]), {});
  await closingFresh;
});

it('checks the live Ring lease before worker dispatch and can still inspect and close a fenced wallet', async () => {
  const sent = vi.fn();
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    postMessage(request: { operation: string; id: number; payload?: { path?: string } }) {
      sent(request);
      const result = request.payload?.path === '/api/wallets' ? [] : null;
      queueMicrotask(() => this.onmessage?.({ data: { id: request.id, result } }));
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const session = new WalletSession('y'.repeat(52));
  const guard = vi.fn(() => {
    throw new Error('Device lease expired');
  });
  session.guardRingDevice(guard);
  const key = new Uint8Array(32).fill(17);
  await expect(session.createRingWallet(key, 'regtest', 'create')).rejects.toThrow('Device lease expired');
  expect(key).toEqual(new Uint8Array(32));
  session.client.selectWallet('a'.repeat(32));
  await expect(session.client.startWallet()).rejects.toThrow('Device lease expired');
  expect(sent).not.toHaveBeenCalled();
  expect(await session.client.listWallets()).toEqual([]);
  await session.ringBinding();
  await session.close();
  expect(sent.mock.calls.map(([call]) => call.operation)).toEqual(['request', 'ring-binding', 'close']);
});

it('delivers primary status hints only to listeners for the active, unlocked wallet', async () => {
  const workers: TestWorker[] = [];
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    constructor() {
      workers.push(this);
    }
    postMessage(request: Request) {
      queueMicrotask(() => this.onmessage?.({ data: { id: request.id, result: null } }));
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const session = new WalletSession(auth.currentUserPubky);
  const listener = vi.fn();
  const unsubscribe = session.onPrimaryChange(listener);
  const hint = (account = auth.currentUserPubky) =>
    workers[0].onmessage?.({ data: { event: 'primary-change', account } });
  hint();
  session.client.selectWallet('a'.repeat(32));
  hint('another account');
  expect(listener).not.toHaveBeenCalled();
  hint();
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  hint();
  expect(listener).toHaveBeenCalledOnce();
  session.onPrimaryChange(listener);
  session.guardRingDevice(() => {
    throw new Error('Device lease expired');
  });
  hint();
  expect(listener).toHaveBeenCalledOnce();
  session.guardRingDevice(() => {});
  const closing = session.close();
  hint();
  await closing;
  expect(listener).toHaveBeenCalledOnce();
});

it('accepts progress only for its pending start, selected wallet and current device', async () => {
  const sent = vi.fn<(request: Request & { notifyStartProgress?: boolean }) => void>();
  const workers: TestWorker[] = [];
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    constructor() {
      workers.push(this);
    }
    postMessage(request: Request) {
      sent(request);
      if (request.operation === 'close') this.onmessage?.({ data: { id: request.id, result: null } });
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const progress = vi.fn();
  const session = new WalletSession(auth.currentUserPubky, undefined, progress);
  const walletId = 'e'.repeat(32);
  session.client.selectWallet(walletId);
  const start = session.client.startWallet();
  const req = sent.mock.lastCall![0];
  expect(req.notifyStartProgress).toBe(true);
  const [worker] = workers;
  const event = { id: req.id, event: 'start-progress', phase: 'scanning', primaryConnected: true, detail: 'private' };
  worker.onmessage?.({ data: { ...event, id: -1 } });
  worker.onmessage?.({ data: { ...event, phase: 'private' } });
  worker.onmessage?.({ data: { ...event, primaryConnected: 'unknown' } });
  session.client.selectWallet('a'.repeat(32));
  worker.onmessage?.({ data: event });
  session.client.selectWallet(walletId);
  session.guardRingDevice(() => {
    throw new Error('Lease expired');
  });
  worker.onmessage?.({ data: event });
  expect(progress).not.toHaveBeenCalled();
  session.guardRingDevice(() => {});
  worker.onmessage?.({ data: event });
  worker.onmessage?.({ data: { id: req.id, result: {} } });
  await start;
  worker.onmessage?.({ data: event });
  expect(progress.mock.calls).toEqual([[{ phase: 'scanning', primaryConnected: true }]]);
  expect(sent).toHaveBeenCalledOnce();
  await session.close();
});

it.each(['current', 'other account', 'signout', 'sync', 'new generation', 'new session', 'lock'])(
  'delivers local unlock only to the pending open for its current signed-in owner (%s)',
  async (condition) => {
    const account = 'y'.repeat(52);
    const walletId = 'a'.repeat(32);
    Object.assign(auth, {
      session: {},
      generation: 'original',
      currentUserPubky: account,
      needsAccountSync: false,
      isLoggingOut: false,
    });
    const workers: TestWorker[] = [];
    class TestWorker {
      onmessage?: (event: { data: unknown }) => void;
      requests: Request[] = [];
      constructor() {
        workers.push(this);
      }
      postMessage(request: Request) {
        this.requests.push(request);
        if (request.operation !== 'open')
          queueMicrotask(() => this.onmessage?.({ data: { id: request.id, result: null } }));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', TestWorker);
    const notify = vi.fn();
    const session = new WalletSession(account, notify);
    const [worker] = workers;
    const opening = session.open('vault password');
    await vi.waitFor(() => expect(worker.requests.some((request) => request.operation === 'open')).toBe(true));
    const open = worker.requests.find((request) => request.operation === 'open')!;
    expect(open).toHaveProperty('notifyUnlocked', true);
    const payload = {
      id: open.id,
      event: 'unlocked',
      account,
      balance: { walletId, network: 'regtest', totalSats: 5, updatedAt: 123 },
    };
    worker.onmessage?.({ data: { ...payload, id: -1 } });
    worker.onmessage?.({ data: { ...payload, account: 'another' } });
    expect(notify).not.toHaveBeenCalled();
    if (condition === 'other account') auth.currentUserPubky = 'b'.repeat(52);
    if (condition === 'signout') auth.isLoggingOut = true;
    if (condition === 'sync') auth.needsAccountSync = true;
    if (condition === 'new generation') auth.generation = 'replacement';
    if (condition === 'new session') auth.session = {};
    const close = condition === 'lock' ? session.close() : undefined;
    worker.onmessage?.({ data: payload });
    worker.onmessage?.({ data: payload });
    worker.onmessage?.({ data: { id: open.id, result: {} } });
    expect(notify).toHaveBeenCalledTimes(condition === 'current' ? 1 : 0);
    session.client.selectWallet(walletId);
    if (condition === 'current') {
      await expect(opening).resolves.toEqual({});
      expect(notify).toHaveBeenCalledWith(payload.balance);
      await expect(session.rememberBalance('f'.repeat(32), 'regtest', 5)).rejects.toThrow();
      await session.rememberBalance(walletId, 'regtest', 5);
      expect(worker.requests.at(-1)).toMatchObject({
        operation: 'remember-balance',
        payload: { walletId, network: 'regtest', totalSats: 5 },
      });
    } else {
      await expect(opening).rejects.toMatchObject({ code: 'WALLET_CLOSED' });
      const dispatched = worker.requests.length;
      await expect(session.ringBinding()).rejects.toMatchObject({ code: 'WALLET_CLOSED' });
      expect(worker.requests).toHaveLength(dispatched);
      await expect(session.rememberBalance(walletId, 'regtest', 5)).rejects.toThrow();
    }
    await (close ?? session.close());
  },
);

const offlineQuote: ReceiveQuote = {
  id: 'offline-request-01',
  mode: 'offline',
  amountSats: 6_000,
  description: 'Lunch',
  feeSats: 0,
  netSats: 6_000,
  expiresAt: Date.now() + 60_000,
  warnings: [],
};
const offlineRequest: ReceiveRequest = {
  ...offlineQuote,
  amountSats: 6_000,
  uri: 'lnbcrt1...',
  bolt11: 'lnbcrt1...',
  paymentHash: 'b'.repeat(64),
  offlineReceive: true,
  demo: false,
};

type WorkerCall = Request & { payload: { path?: string; request?: ReceiveRequest } };
function offlineSession(handler: (request: WorkerCall) => unknown) {
  class TestWorker {
    onmessage?: (event: { data: unknown }) => void;
    async postMessage(req: WorkerCall) {
      try {
        const result = await handler(req);
        this.onmessage?.({ data: { id: req.id, result } });
      } catch (err) {
        this.onmessage?.({ data: { id: req.id, error: { message: (err as Error).message } } });
      }
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const session = new WalletSession(auth.currentUserPubky);
  session.client.selectWallet('a'.repeat(32));
  return session;
}

it('opens only validated, completed local receipts in reverse date order', async () => {
  const walletId = 'a'.repeat(32);
  const completed = {
    id: 'payment',
    reference: 'payment',
    kind: 'sent',
    amountSats: 126,
    timestamp: 4,
    status: 'completed',
  };
  const reads: string[] = [];
  const session = offlineSession(({ operation, payload }) => {
    reads.push(operation);
    if (operation === 'load-activity') {
      expect(payload).toEqual({ walletId });
      return [
        { ...completed, secret: 'discard' },
        { ...completed, id: 'invalid', amountSats: -2 },
        { ...completed, id: 'pending', status: 'pending' },
        { ...completed, id: 'newer', timestamp: 12 },
        { ...completed, amountSats: 100 },
        ...Array.from({ length: 25 }, (_, i) => ({ ...completed, id: 'old-' + i, timestamp: 0 })),
      ];
    }
    return null;
  });
  await expect(session.savedActivity('f'.repeat(32))).rejects.toThrow('locked');
  expect(reads).toEqual([]);
  const rows = await session.savedActivity(walletId);
  expect(rows).toHaveLength(20);
  expect(rows.slice(0, 2).map((row) => [row.id, row.amountSats])).toEqual([
    ['newer', 126],
    ['payment', 126],
  ]);
  expect(rows.some((row) => ['invalid', 'pending'].includes(row.id))).toBe(false);
  expect(rows[1]).not.toHaveProperty('secret');
  rows[1].amountSats = 0;
  expect((await session.savedActivity(walletId))[1].amountSats).toBe(126);
  expect(reads).toEqual(['ring-binding', 'load-activity', 'ring-binding']);
  await session.close();
});

it('skips the preview when the local ledger reader is unavailable', async () => {
  const operations: string[] = [];
  const session = offlineSession(({ operation }) => operations.push(operation));
  Object.defineProperty(session.client, '_ledgerFor', { value: undefined });
  await expect(session.savedActivity('a'.repeat(32))).resolves.toEqual([]);
  expect(operations).toEqual([]);
  await session.close();
});

it.each(['switch', 'device', 'account', 'close'])('discards a local receipt read after a %s change', async (change) => {
  const read = Promise.withResolvers<unknown[]>();
  const operations: string[] = [];
  const session = offlineSession(({ operation }) => {
    operations.push(operation);
    if (operation === 'load-activity') return read.promise;
    if (operation === 'ring-binding') return { deviceId: 'device', network: 'mainnet' };
    return null;
  });
  const walletId = 'a'.repeat(32);
  let revoked = false;
  const generation = auth.generation;
  try {
    await expect(session.savedActivity(walletId)).rejects.toThrow('locked');
    expect(operations).toEqual(['ring-binding']);
    session.guardRingDevice(() => {
      if (revoked) throw new Error('Device inactive');
    });
    const result = session.savedActivity(walletId);
    await vi.waitFor(() => expect(operations).toEqual(['ring-binding', 'load-activity']));
    if (change === 'switch') session.client.selectWallet('e'.repeat(32));
    if (change === 'device') revoked = true;
    if (change === 'account') auth.generation += '-next';
    if (change === 'close') void session.close();
    read.resolve([]);
    await expect(result).rejects.toThrow();
  } finally {
    auth.generation = generation;
    await session.close();
  }
});

it('records the draft before contacting the primary and releases the QR only after durable tracking', async () => {
  const operations: string[] = [];
  let release!: () => void;
  const committed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session = offlineSession((req) => {
    operations.push(req.operation);
    if (req.operation === 'finish-offline-receive') return committed;
  });
  const received = vi.spyOn(session.client, 'receive').mockImplementation(async () => {
    expect(operations).toEqual(['begin-offline-receive']);
    return offlineRequest;
  });
  let shown = false;
  const pending = session.receive(offlineQuote).then((invoice) => {
    shown = true;
    return invoice;
  });
  await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());
  expect(operations).toEqual(['begin-offline-receive', 'finish-offline-receive']);
  expect(shown).toBe(false);
  await expect(session.discardOfflineReceiveDraft(offlineQuote.id)).rejects.toMatchObject({ code: 'RECEIVE_BUSY' });
  release();
  await expect(pending).resolves.toEqual(offlineRequest);
  await session.close();
});

it('leaves an unresolved reservation resumable and preserves registered invoices when retries are dismissed', async () => {
  let registered = false;
  const op = vi.fn((req: WorkerCall) => {
    if (req.payload?.path?.endsWith('/receive/requests')) return { requests: registered ? [offlineRequest] : [] };
    if (req.payload?.path?.endsWith('/receive/offline'))
      return { requests: [{ id: offlineQuote.id, channelId: 'channel' }] };
  });
  const session = offlineSession(op);
  await expect(session.discardOfflineReceiveDraft(offlineQuote.id)).rejects.toMatchObject({ code: 'RECEIVE_PENDING' });
  expect(op.mock.calls.some(([req]) => req.operation === 'discard-offline-draft')).toBe(false);
  registered = true;
  await session.discardOfflineReceiveDraft(offlineQuote.id);
  expect(op.mock.calls.at(-1)?.[0]).toMatchObject({
    operation: 'finish-offline-receive',
    payload: { request: offlineRequest },
  });
  await session.close();
});
