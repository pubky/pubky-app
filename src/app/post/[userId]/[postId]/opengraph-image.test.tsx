import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostImage from './opengraph-image';

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0035NGP297YG0';
const NEXUS = 'https://nexus.staging.pubky.app/v0';

/**
 * Regression coverage for the crawl-facing id shapes behind the `AppError: Bad
 * Request` family (PUBKY-APP-1E/9Z/A0/BQ). `normalizePostIds` rejects them at
 * the route boundary, so the route must answer with the branded fallback card
 * and never reach Nexus — the 400 those ids used to produce was reported as a
 * product error.
 */
describe('post opengraph-image', () => {
  beforeEach(() => {
    // Hermetic: a 404 leaves the renderer on the fallback card.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['a trailing dot on the author id', `${PUBKY}.`, POST_ID],
    ['an encoded $ as the author id', '%24', POST_ID],
    ['an oversized author id', 'a'.repeat(53), POST_ID],
    ['an empty post id', PUBKY, ''],
    ['a trailing comma on the post id', PUBKY, `${POST_ID},`],
    ['a leading quote on the post id', PUBKY, `"${POST_ID}`],
  ])('returns the fallback card without a Nexus request for %s', async (_label, userId, postId) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await PostImage({ params: Promise.resolve({ userId, postId }) });

    expect(response.headers.get('content-type')).toContain('image/png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('strips a percent-encoded newline escape and fetches the cleaned id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // iOS/Android link previewers append `%5Cn` escapes to the segment they copy.
    await PostImage({ params: Promise.resolve({ userId: PUBKY, postId: `${POST_ID}%5Cn%5Cn` }) });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      `${NEXUS}/user/${PUBKY}/details`,
      `${NEXUS}/post/${PUBKY}/${POST_ID}/details`,
    ]);
  });

  it('fetches the post for valid ids', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await PostImage({ params: Promise.resolve({ userId: PUBKY, postId: POST_ID }) });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      `${NEXUS}/user/${PUBKY}/details`,
      `${NEXUS}/post/${PUBKY}/${POST_ID}/details`,
    ]);
    expect(response.headers.get('content-type')).toContain('image/png');
  });
});
