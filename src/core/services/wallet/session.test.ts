import { type SendReview, WalletError } from '@beignet/wallet-core';
import { afterEach, expect, it, vi } from 'vitest';
import { WalletSession } from './session';

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

it.each(['current', 'other account', 'signout', 'sync', 'new generation', 'lock'])(
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
    const close = condition === 'lock' ? session.close() : undefined;
    worker.onmessage?.({ data: payload });
    worker.onmessage?.({ data: payload });
    worker.onmessage?.({ data: { id: open.id, result: {} } });
    await opening;
    expect(notify).toHaveBeenCalledTimes(condition === 'current' ? 1 : 0);
    session.client.selectWallet(walletId);
    if (condition === 'current') {
      expect(notify).toHaveBeenCalledWith(payload.balance);
      await expect(session.rememberBalance('f'.repeat(32), 'regtest', 5)).rejects.toThrow();
      await session.rememberBalance(walletId, 'regtest', 5);
      expect(worker.requests.at(-1)).toMatchObject({
        operation: 'remember-balance',
        payload: { walletId, network: 'regtest', totalSats: 5 },
      });
    } else {
      await expect(session.rememberBalance(walletId, 'regtest', 5)).rejects.toThrow();
    }
    await (close ?? session.close());
  },
);
