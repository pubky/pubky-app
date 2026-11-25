import { describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  buildLocalAvatarPath,
  buildLocalFilePath,
  isLocalMediaAnswer,
  isLocalMediaMessage,
  type LocalMediaAnswer,
  type LocalMediaRequest,
  parseLocalMediaPath,
  respondLocalMedia,
} from './localMedia';

const ORIGIN = 'https://pubky.app';
const ALICE = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';

/** A Cache Storage cache over a Map, which keeps insertion order like the real one. */
function memoryCache() {
  const entries = new Map<string, Response>();
  const cache = {
    entries,
    match: vi.fn(async (key: string) => entries.get(key)?.clone()),
    put: vi.fn(async (key: string, response: Response) => {
      entries.delete(key);
      entries.set(key, response);
    }),
    keys: vi.fn(async () => [...entries.keys()].map((key) => new Request(key))),
    delete: vi.fn(async (key: Request) => entries.delete(key.url)),
  };
  return cache;
}

type RespondOptions = {
  answer: Promise<LocalMediaAnswer | null>;
  cache?: ReturnType<typeof memoryCache>;
  maxEntries?: number;
  timeoutMs?: number;
};

function respond(path: string, { answer, cache = memoryCache(), maxEntries = 10, timeoutMs = 1000 }: RespondOptions) {
  const ask = vi.fn((_media: LocalMediaRequest) => answer);
  const response = respondLocalMedia({
    request: new Request(`${ORIGIN}${path}`),
    openCache: async () => asOpaque<Cache>(cache),
    ask,
    timeoutMs,
    maxEntries,
  });
  return { response, ask, cache };
}

const found = (text: string, contentType = 'image/png'): LocalMediaAnswer => ({
  status: 'found',
  bytes: Uint8Array.from(text, (char) => char.charCodeAt(0)).buffer,
  contentType,
});

describe('local media paths', () => {
  it('builds an avatar path with the version as its query', () => {
    expect(buildLocalAvatarPath(ALICE)).toBe(`/_pubky/avatar/${ALICE}`);
    expect(buildLocalAvatarPath(ALICE, 1700000000000)).toBe(`/_pubky/avatar/${ALICE}?v=1700000000000`);
  });

  it('builds a file path from the owner and the whole file name', () => {
    expect(buildLocalFilePath(ALICE, '7BKXG1FPF2D680NCPW5D82BAGM.png')).toBe(
      `/_pubky/file/${ALICE}/7BKXG1FPF2D680NCPW5D82BAGM.png`,
    );
  });

  it('parses what it builds', () => {
    expect(parseLocalMediaPath(`/_pubky/avatar/${ALICE}`)).toEqual({ kind: 'avatar', user: ALICE });
    expect(parseLocalMediaPath(buildLocalFilePath(ALICE, 'a b.png'))).toEqual({
      kind: 'file',
      owner: ALICE,
      name: 'a b.png',
    });
  });

  it.each([
    '/home',
    '/_pubky/',
    '/_pubky/avatar/',
    `/_pubky/avatar/${ALICE}/extra`,
    `/_pubky/file/${ALICE}`,
    `/_pubky/file/${ALICE}//x.png`,
    '/_pubky/other/x',
    '/_pubky/avatar/%E0%A4%A',
  ])('names nothing for %s', (path) => {
    expect(parseLocalMediaPath(path)).toBeNull();
  });

  it('recognizes only well-formed messages and answers', () => {
    expect(isLocalMediaMessage({ type: 'LOCAL_MEDIA_REQUEST', request: { kind: 'avatar', user: ALICE } })).toBe(true);
    expect(isLocalMediaMessage({ type: 'LOCAL_MEDIA_REQUEST', request: { kind: 'file', owner: ALICE } })).toBe(false);
    expect(isLocalMediaMessage({ type: 'CLIENT_ANNOUNCE' })).toBe(false);
    expect(isLocalMediaAnswer(found('x'))).toBe(true);
    expect(isLocalMediaAnswer({ status: 'none' })).toBe(true);
    expect(isLocalMediaAnswer({ status: 'found', bytes: 'x', contentType: 'image/png' })).toBe(false);
    expect(isLocalMediaAnswer(null)).toBe(false);
  });
});

describe('respondLocalMedia', () => {
  it('answers from the cache without asking a page', async () => {
    const cache = memoryCache();
    cache.entries.set(`${ORIGIN}/_pubky/avatar/${ALICE}?v=2`, new Response('cached'));

    const { response, ask } = respond(`/_pubky/avatar/${ALICE}?v=2`, { cache, answer: Promise.resolve(null) });

    expect(await (await response).text()).toBe('cached');
    expect(ask).not.toHaveBeenCalled();
  });

  it('serves the bytes a page hands over and caches them under the full URL', async () => {
    const { response, ask, cache } = respond(`/_pubky/file/${ALICE}/abc.png`, {
      answer: Promise.resolve(found('png bytes')),
    });

    const served = await response;
    expect(ask).toHaveBeenCalledWith({ kind: 'file', owner: ALICE, name: 'abc.png' });
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('content-security-policy')).toBe('sandbox');
    expect(await served.text()).toBe('png bytes');
    expect(await cache.entries.get(`${ORIGIN}/_pubky/file/${ALICE}/abc.png`)?.text()).toBe('png bytes');
  });

  it('leaves a PDF out of the sandbox, where browsers refuse to render it', async () => {
    const { response } = respond(`/_pubky/file/${ALICE}/doc.pdf`, {
      answer: Promise.resolve(found('%PDF', 'application/pdf')),
    });

    expect((await response).headers.get('content-security-policy')).toBeNull();
  });

  it('keeps a new avatar version apart from the old one', async () => {
    const cache = memoryCache();
    cache.entries.set(`${ORIGIN}/_pubky/avatar/${ALICE}?v=1`, new Response('old'));

    const { response, ask } = respond(`/_pubky/avatar/${ALICE}?v=2`, { cache, answer: Promise.resolve(found('new')) });

    expect(await (await response).text()).toBe('new');
    expect(ask).toHaveBeenCalledWith({ kind: 'avatar', user: ALICE });
  });

  it('deletes the oldest entries past the bound', async () => {
    const cache = memoryCache();
    cache.entries.set(`${ORIGIN}/_pubky/file/${ALICE}/1.png`, new Response('1'));
    cache.entries.set(`${ORIGIN}/_pubky/file/${ALICE}/2.png`, new Response('2'));

    const { response } = respond(`/_pubky/file/${ALICE}/3.png`, {
      cache,
      answer: Promise.resolve(found('3')),
      maxEntries: 2,
    });
    await response;

    expect([...cache.entries.keys()]).toEqual([
      `${ORIGIN}/_pubky/file/${ALICE}/2.png`,
      `${ORIGIN}/_pubky/file/${ALICE}/3.png`,
    ]);
  });

  it.each([
    [{ status: 'none' } as const, 404],
    [{ status: 'failed' } as const, 502],
    [null, 504],
  ])('responds to the answer %j with %i and caches nothing', async (answer, status) => {
    const { response, cache } = respond(`/_pubky/avatar/${ALICE}`, { answer: Promise.resolve(answer) });

    expect((await response).status).toBe(status);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('responds 504 when no page answers in time', async () => {
    const { response, cache } = respond(`/_pubky/avatar/${ALICE}`, { answer: new Promise(() => {}), timeoutMs: 5 });

    expect((await response).status).toBe(504);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('responds 404 to a path that names no media, without asking', async () => {
    const { response, ask } = respond('/_pubky/other/x', { answer: Promise.resolve(found('x')) });

    expect((await response).status).toBe(404);
    expect(ask).not.toHaveBeenCalled();
  });

  it('still serves the media when Cache Storage is unavailable', async () => {
    const response = await respondLocalMedia({
      request: new Request(`${ORIGIN}/_pubky/avatar/${ALICE}`),
      openCache: () => Promise.reject(new DOMException('blocked', 'SecurityError')),
      ask: async () => found('avatar'),
      timeoutMs: 1000,
      maxEntries: 10,
    });

    expect(await response.text()).toBe('avatar');
  });
});
