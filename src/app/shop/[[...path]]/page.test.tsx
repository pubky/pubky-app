import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as metadataConfig from '@/config/metadata';
import { generateMetadata } from './page';

const SELLER = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const PATH = ['marketplace', 'listing', SELLER, 'handmade-bag_1'];
const OUTER_PATH = `/shop/${PATH.join('/')}`;
const EMBED_PATH = `/shop-embed/${PATH.join('/')}`;
const TITLE = 'Handmade leather bag with brass buckles — 25,000 SAT | Pubky Market';
const DESCRIPTION = 'Listing paused. A handmade bag with original brass buckles.';

function listingHtml(title = TITLE, description = DESCRIPTION) {
  return new Response(
    `<html><head><meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:image" content="${EMBED_PATH}/opengraph-image?version=abc123" /></head></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

describe('Shop listing metadata', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(listingHtml());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies the full listing preview while keeping the App wrapper canonical', async () => {
    const result = await generateMetadata({ params: Promise.resolve({ path: PATH }) });
    const image = `https://pubky.app${EMBED_PATH}/opengraph-image?version=abc123`;

    expect(result.title).toBe(TITLE);
    expect(result.description).toBe(DESCRIPTION);
    expect(result.alternates.canonical).toBe(OUTER_PATH);
    expect(result.openGraph).toMatchObject({
      title: TITLE,
      description: DESCRIPTION,
      url: OUTER_PATH,
      images: [{ url: image, width: 1200, height: 630 }],
    });
    expect(result.twitter).toMatchObject({ card: 'summary_large_image', title: TITLE, images: [image] });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://pubky.app${EMBED_PATH}`,
      expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }),
    );
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(options?.headers).toEqual({ Accept: 'text/html', 'User-Agent': 'facebookexternalhit/1.1' });
  });

  it('uses the existing configured deployment origin for staging', async () => {
    vi.spyOn(metadataConfig, 'getDefaultUrl').mockReturnValue('https://staging.pubky.app');
    const result = await generateMetadata({ params: Promise.resolve({ path: PATH }) });

    expect(fetch).toHaveBeenCalledWith(`https://staging.pubky.app${EMBED_PATH}`, expect.anything());
    expect(result.twitter.images).toEqual([`https://staging.pubky.app${EMBED_PATH}/opengraph-image?version=abc123`]);
  });

  it('preserves Shop fallback copy for removed or unavailable listings', async () => {
    vi.mocked(fetch).mockResolvedValue(listingHtml('Pubky Market', 'Shop supplies this fallback.'));
    const result = await generateMetadata({ params: Promise.resolve({ path: PATH }) });

    expect(result.title).toBe('Pubky Market');
    expect(result.description).toBe('Shop supplies this fallback.');
    expect(result.alternates.canonical).toBe(OUTER_PATH);
  });

  it('suppresses the inherited App description when Shop publishes no description', async () => {
    vi.mocked(fetch).mockResolvedValue(listingHtml(TITLE, ''));
    const result = await generateMetadata({ params: Promise.resolve({ path: PATH }) });

    expect(result.description).toBeNull();
    expect(result.openGraph.description).toBe('');
    expect(result.twitter.description).toBe('');
  });

  it.each([404, 503])('uses a Market fallback on HTTP %s and keeps the listing canonical', async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    const result = await generateMetadata({ params: Promise.resolve({ path: PATH }) });

    expect(result.title).toBe('Pubky Market');
    expect(result.description).toBe('Buy and sell on Pubky Market.');
    expect(result.openGraph).toMatchObject({
      title: 'Pubky Market',
      description: 'Buy and sell on Pubky Market.',
      siteName: 'Pubky Market',
    });
    expect(result.twitter).toMatchObject({ title: 'Pubky Market', description: 'Buy and sell on Pubky Market.' });
    expect(result.alternates.canonical).toBe(OUTER_PATH);
    expect(result.twitter.images).toEqual(['/shop-embed/marketplace/opengraph-image']);
  });

  it.each(
    [
      undefined,
      [],
      ['marketplace', 'orders'],
      ['api', 'marketplace', SELLER, 'test'],
      ['marketplace', 'listing', 'https://evil.example', 'test'],
      ['marketplace', 'listing', SELLER, '..'],
      ['marketplace', 'listing', SELLER, '%2e%2e'],
      ['marketplace', 'listing', SELLER, 'a%2fb'],
      ['marketplace', 'listing', SELLER, 'a/b'],
      ['marketplace', 'listing', SELLER, 'a\\b'],
      ['marketplace', 'listing', SELLER, 'a?token=secret'],
      ['marketplace', 'listing', SELLER, 'a#fragment'],
      ['marketplace', 'listing', SELLER, 'a\u0000b'],
      ['marketplace', 'listing', SELLER, 'a'.repeat(129)],
      [...PATH, 'edit'],
    ].map((path) => ({ path })),
  )('does not fetch for a non-listing or unsafe path: $path', async ({ path }) => {
    const result = await generateMetadata({ params: Promise.resolve({ path }) });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.title).toBe('Pubky Market');
    expect(result.alternates.canonical).toBe('/shop');
  });
});
