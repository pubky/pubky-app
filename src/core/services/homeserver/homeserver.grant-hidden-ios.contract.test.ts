import { webcrypto } from 'node:crypto';
import { GrantAuthFlow, Pubky } from '@synonymdev/pubky';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { APP_CAPABILITIES } from '@/config/auth';
import { getDefaultHttpRelay } from '@/config/network';
import { HomeserverService } from './homeserver';

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(),
  userUriBuilder: (key: string) => `pubky://${key}/pub/pubky.app/profile.json`,
}));

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

type THeldRequest = { method: string; url: string; respond: (response: Response) => void; aborted: boolean };

/** Every relay request the SDK makes, held until the test answers it. */
const requests: THeldRequest[] = [];
const open = (method: string) => requests.filter((request) => request.method === method && !request.aborted);

let visibility: 'visible' | 'hidden' = 'visible';
const setVisibility = (next: 'visible' | 'hidden') => {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
};

/**
 * The SDK 0.16.2 listener ACKs an approval (`DELETE {relay}/{channel}`) and only queues it once that request
 * settles. When the page hides in between, the relay may already have dropped the approval while nothing is
 * queued yet, so the flow must stay live until it delivers that approval. Exercised with the real SDK.
 */
describe('App grant flow when iOS hides the page during the relay ACK (real SDK)', () => {
  beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('isSecureContext', true);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (_name: string, options: unknown, callback?: () => unknown) =>
          typeof options === 'function' ? options() : callback?.(),
      },
    });
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const signal = init?.signal ?? request.signal;
      return new Promise<Response>((resolve, reject) => {
        // reqwest parses `Response.url`, which a constructed Response leaves empty.
        const respond = (response: Response) =>
          resolve(Object.defineProperty(response, 'url', { value: request.url, configurable: true }));
        const held: THeldRequest = { method: request.method, url: request.url, respond, aborted: false };
        requests.push(held);
        const abort = () => {
          held.aborted = true;
          reject(new DOMException('The fixture relay was canceled', 'AbortError'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    });
  });

  afterEach(() => {
    setVisibility('visible');
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('delivers the approval held by an in-flight ACK once visible, without resuming or a second approval', async () => {
    const resumeDelegated = vi.spyOn(GrantAuthFlow, 'resumeDelegated');
    const resumeLocal = vi.spyOn(Pubky.prototype, 'resumeGrantAuthFlow');
    const flow = await HomeserverService.startGrantFlow({
      purpose: 'signin',
      capabilities: APP_CAPABILITIES,
      generation: '',
      fresh: true,
    });
    const outcome = flow.awaitApproval.then(
      () => 'session',
      (error: { context?: { originalError?: string } }) => error.context?.originalError ?? String(error),
    );
    try {
      const relay = `${getDefaultHttpRelay().replace(/\/+$/, '')}/`;
      await vi.waitFor(() => expect(open('GET')).toHaveLength(1));
      const channelUrl = open('GET')[0].url;
      expect(channelUrl.startsWith(relay)).toBe(true);

      // The signer's approval arrives: an intentionally empty payload, so reaching the decoder proves delivery.
      open('GET')[0].respond(new Response(new Uint8Array(0), { status: 200 }));
      await vi.waitFor(() => expect(open('DELETE')).toHaveLength(1));
      expect(open('DELETE')[0].url).toBe(channelUrl);

      // Safari hides while the relay has applied the DELETE and its response is still on the way.
      setVisibility('hidden');
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(open('DELETE')).toHaveLength(1);
      expect(resumeDelegated).not.toHaveBeenCalled();

      open('DELETE')[0].respond(new Response(null, { status: 200 }));
      setVisibility('visible');

      // The live flow's listener queued the same approval and the poll handed it to the decoder.
      await expect(outcome).resolves.toMatch(/invalid grant payload/);
      expect(resumeDelegated).not.toHaveBeenCalled();
      expect(resumeLocal).not.toHaveBeenCalled();
      expect(requests.filter((request) => request.method === 'GET')).toHaveLength(1);
      expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
    } finally {
      flow.cancelAuthFlow();
      resumeDelegated.mockRestore();
      resumeLocal.mockRestore();
    }
  });
});
