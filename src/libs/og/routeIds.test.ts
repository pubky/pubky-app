import { describe, expect, it } from 'vitest';
import { normalizePostIds, normalizeProfileId, safeDecode } from './routeIds';

const VALID_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

describe('safeDecode', () => {
  it('decodes percent-encoded segments', () => {
    expect(safeDecode('%2E')).toBe('.');
  });

  it('returns null on malformed encoding instead of throwing', () => {
    expect(safeDecode('abc%')).toBeNull();
    expect(safeDecode('%ZZ')).toBeNull();
  });
});

describe('normalizeProfileId', () => {
  it('accepts a valid pubky identifier', () => {
    expect(normalizeProfileId(VALID_PUBKY)).toBe(VALID_PUBKY);
  });

  it('decodes the segment before validating', () => {
    expect(normalizeProfileId(`%2E%2F${VALID_PUBKY}`)).toBeNull();
    expect(normalizeProfileId(VALID_PUBKY)).toBe(VALID_PUBKY);
  });

  it('rejects crawl-mangled variants: trailing dot, bracket, whitespace', () => {
    expect(normalizeProfileId(`${VALID_PUBKY}.`)).toBeNull();
    expect(normalizeProfileId(`${VALID_PUBKY})`)).toBeNull();
    expect(normalizeProfileId(`${VALID_PUBKY} "`)).toBeNull();
  });

  it('rejects non-identifier ids and empty paths', () => {
    expect(normalizeProfileId('posts')).toBeNull();
    expect(normalizeProfileId('.')).toBeNull();
    expect(normalizeProfileId('ABC123...')).toBeNull();
  });
});

describe('normalizePostIds', () => {
  const POST_ID = '3nelqvaws4knxg6oyvffy7ctidxm1wpuh4udemtxyyy4zcsyjwgy';

  it('accepts a valid user/post pair', () => {
    expect(normalizePostIds(VALID_PUBKY, POST_ID)).toEqual({ userId: VALID_PUBKY, postId: POST_ID });
  });

  it('rejects crawl-mangled variants: trailing dot, bracket, comma, quote', () => {
    expect(normalizePostIds(`${VALID_PUBKY}.`, POST_ID)).toBeNull();
    expect(normalizePostIds(VALID_PUBKY, `${POST_ID})`)).toBeNull();
    expect(normalizePostIds(VALID_PUBKY, `${POST_ID},`)).toBeNull();
    expect(normalizePostIds(VALID_PUBKY, `"${POST_ID}`)).toBeNull();
  });

  it('rejects malformed percent-encoding in either segment', () => {
    expect(normalizePostIds('abc%', POST_ID)).toBeNull();
    expect(normalizePostIds(VALID_PUBKY, '%')).toBeNull();
  });

  it('rejects a dot-only or empty post id', () => {
    expect(normalizePostIds(VALID_PUBKY, '.')).toBeNull();
    expect(normalizePostIds(VALID_PUBKY, '')).toBeNull();
  });

  it('leaves mid-id characters untouched (dot-free ids only end mangled)', () => {
    // A post id containing an interior dot is not a shape we see from crawlers;
    // interior characters are opaque and pass through.
    const mid = `a.${POST_ID.slice(2)}`;
    expect(normalizePostIds(VALID_PUBKY, mid)).toEqual({ userId: VALID_PUBKY, postId: mid });
  });
});
