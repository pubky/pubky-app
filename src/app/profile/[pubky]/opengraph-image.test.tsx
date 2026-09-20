import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileImage from './opengraph-image';

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const NEXUS = 'https://nexus.staging.pubky.app/v0/user';

/**
 * Regression coverage for the crawl-facing id shapes behind the `AppError: Bad
 * Request` family (PUBKY-APP-1E/9Z/A0/BQ). `normalizeProfileId` rejects them at
 * the route boundary, so the route must answer with the branded fallback card
 * and never reach Nexus — the 400 those ids used to produce was reported as a
 * product error.
 */
describe('profile opengraph-image', () => {
  beforeEach(() => {
    // Hermetic: a 404 leaves the renderer on the fallback card.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['a trailing dot', `${PUBKY}.`],
    ['a percent-encoded trailing dot', `${PUBKY}%2E`],
    ['a closing bracket', `${PUBKY})`],
    ['an encoded $', '%24'],
    ['an empty id', ''],
    ['an oversized id', 'a'.repeat(53)],
    ['an uppercase id', PUBKY.toUpperCase()],
  ])('returns the fallback card without a Nexus request for %s', async (_label, pubky) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await ProfileImage({ params: Promise.resolve({ pubky }) });

    expect(response.headers.get('content-type')).toContain('image/png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('strips a percent-encoded newline escape and fetches the cleaned id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // iOS/Android link previewers append `%5Cn` escapes to the segment they copy.
    await ProfileImage({ params: Promise.resolve({ pubky: `${PUBKY}%5Cn%5Cn` }) });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([`${NEXUS}/${PUBKY}/details`, `${NEXUS}/${PUBKY}/counts`]);
  });

  it('fetches the profile for a valid id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await ProfileImage({ params: Promise.resolve({ pubky: PUBKY }) });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([`${NEXUS}/${PUBKY}/details`, `${NEXUS}/${PUBKY}/counts`]);
    expect(response.headers.get('content-type')).toContain('image/png');
  });
});
