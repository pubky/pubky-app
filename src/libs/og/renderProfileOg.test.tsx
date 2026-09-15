import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderProfileOg } from './renderProfileOg';

// See renderPostOg.test.tsx: satori cannot run under vitest, so the element
// tree handed to `ogImageResponse` is captured and asserted on instead.
const captured = vi.hoisted(() => ({ element: null as ReactElement | null }));

vi.mock('./ogImageResponse', () => ({
  ogImageResponse: vi.fn(async (element: ReactElement) => {
    captured.element = element;
    return new Response('png', { headers: { 'content-type': 'image/png' } });
  }),
}));

vi.mock('./ogData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ogData')>()),
  fetchImageAsDataUri: vi.fn(async () => null),
}));

vi.mock('./renderFallbackOg', () => ({
  renderFallbackOg: vi.fn(async () => new Response('fallback')),
}));

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const MENTIONED = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const renderedMarkup = () => renderToStaticMarkup(captured.element as ReactElement);

describe('renderProfileOg', () => {
  afterEach(() => {
    captured.element = null;
    vi.restoreAllMocks();
  });

  it('swaps raw pubky mentions in the bio for display names, like the app renders them', async () => {
    // First fetch = user details, second = counts (left as 404), third = the mentioned profile.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ id: PUBKY, name: 'Alice', bio: `Building with pk:${MENTIONED}`, image: null, indexed_at: 1 }),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ id: MENTIONED, name: 'Bob' }));

    const res = await renderProfileOg({ pubky: PUBKY });

    expect(res.headers.get('content-type')).toBe('image/png');
    const html = renderedMarkup();
    expect(html).toContain('Building with @Bob');
    expect(html).not.toContain(MENTIONED);
    expect(fetchSpy.mock.calls.at(-1)?.[0]).toBe(`https://nexus.staging.pubky.app/v0/user/${MENTIONED}/details`);
  });

  it('makes no mention lookups for a bio without mentions', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: PUBKY, name: 'Alice', bio: 'hello world', image: null, indexed_at: 1 }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await renderProfileOg({ pubky: PUBKY });

    expect(renderedMarkup()).toContain('hello world');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
