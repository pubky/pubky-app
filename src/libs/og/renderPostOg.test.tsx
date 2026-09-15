import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OG_TOKENS } from './ogConstants';
import { renderPostOg } from './renderPostOg';

// The real `ImageResponse` needs satori's wasm binaries, which do not load
// under vitest, and the card's pixels are not the contract here: capture the
// element tree the renderer hands to `ogImageResponse` and assert on its markup.
const captured = vi.hoisted(() => ({ element: null as ReactElement | null }));

vi.mock('./ogImageResponse', () => ({
  ogImageResponse: vi.fn(async (element: ReactElement) => {
    captured.element = element;
    return new Response('png', { headers: { 'content-type': 'image/png' } });
  }),
}));

// Avatar / attachment bytes (CDN fetch + sharp transcode) are out of scope;
// every card renders its image-less variant.
vi.mock('./ogData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ogData')>()),
  fetchImageAsDataUri: vi.fn(async () => null),
}));

vi.mock('./renderFallbackOg', () => ({
  renderFallbackOg: vi.fn(async () => new Response('fallback')),
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const MENTIONED = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
const MENTIONED_DETAILS_URL = `https://nexus.staging.pubky.app/v0/user/${MENTIONED}/details`;

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const author = { id: AUTHOR, name: 'Alice', bio: '', image: null, indexed_at: 1, links: null, status: null };

const renderedMarkup = () => renderToStaticMarkup(captured.element as ReactElement);
const brandSpan = (text: string) => `<span style="white-space:pre-wrap;color:${OG_TOKENS.brand}">${text}</span>`;

describe('renderPostOg', () => {
  afterEach(() => {
    captured.element = null;
    vi.restoreAllMocks();
  });

  it('swaps raw pubky mentions in the post text for display names, like the app renders them', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(author))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: `gm pk:${MENTIONED}, welcome aboard` }))
      .mockResolvedValueOnce(jsonResponse({ id: MENTIONED, name: 'Bob' }));

    const res = await renderPostOg({ userId: AUTHOR, postId: 'post-1' });

    expect(res.headers.get('content-type')).toBe('image/png');
    const html = renderedMarkup();
    // The mention is its own run in the brand colour, like the app's mention links.
    expect(html).toContain(brandSpan('@Bob'));
    expect(html).toContain('welcome ');
    expect(html).not.toContain(MENTIONED);
    expect(fetchSpy.mock.calls.at(-1)?.[0]).toBe(MENTIONED_DETAILS_URL);
  });

  it('resolves mentions in an article body while the title stays as authored', async () => {
    const content = JSON.stringify({ title: 'Release notes', body: `Thanks pubky${MENTIONED} for the review.` });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(author))
      .mockResolvedValueOnce(jsonResponse({ kind: 'long', content }))
      .mockResolvedValueOnce(jsonResponse({ id: MENTIONED, name: 'Bob' }));

    await renderPostOg({ userId: AUTHOR, postId: 'post-1' });

    const html = renderedMarkup();
    expect(html).toContain('Release notes');
    expect(html).toContain(brandSpan('@Bob '));
    expect(html).toContain('review.');
    expect(html).not.toContain(MENTIONED);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('shows the shortened key when the mentioned profile is unknown to Nexus', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(author))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: `cc pk:${MENTIONED}` }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await renderPostOg({ userId: AUTHOR, postId: 'post-1' });

    const html = renderedMarkup();
    expect(html).toContain(brandSpan('abcd...mnop'));
    expect(html).not.toContain(MENTIONED);
  });

  it('draws an invalid emoji ZWJ sequence as its component emoji, in the header and the mention', async () => {
    // MAGE + ZWJ + TROLL is not an RGI sequence: the emoji provider has no joined glyph.
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ...author, name: 'Miguel 🧙‍🧌' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: `hi pk:${MENTIONED} 👨‍👩‍👧` }))
      .mockResolvedValueOnce(jsonResponse({ id: MENTIONED, name: 'Bob 🧙‍🧌' }));

    await renderPostOg({ userId: AUTHOR, postId: 'post-1' });

    const html = renderedMarkup();
    expect(html).toContain('Miguel 🧙🧌');
    expect(html).toContain(brandSpan('@Bob '));
    expect(html).toContain(brandSpan('🧙🧌 '));
    expect(html).toContain('👨‍👩‍👧');
    expect(html).not.toContain('🧙‍🧌');
  });

  it('makes no mention lookups for a post without mentions', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(author))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: 'hello world' }));

    await renderPostOg({ userId: AUTHOR, postId: 'post-1' });

    expect(renderedMarkup()).toContain('hello </span>');
    expect(renderedMarkup()).toContain('world</span>');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
