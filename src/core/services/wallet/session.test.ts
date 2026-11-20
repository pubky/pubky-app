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
