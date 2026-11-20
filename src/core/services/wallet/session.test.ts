import { afterEach, expect, it, vi } from 'vitest';
import { WalletSession } from './session';

type Request = { id: number; operation: string };

afterEach(() => vi.unstubAllGlobals());

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
