import { describe, expect, it } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getThreadUri } from './ResourceDetails.utils';

describe('getThreadUri', () => {
  const card: TPinakesResourceDetail = { ...(videoFixture as TPinakesResourceDetail), refs: ['https://youtu.be/x'] };

  it('is the card’s canonical link once the card is read, whichever spelling the page has', () => {
    expect(getThreadUri(card.uri, { data: card, isLoading: false }, true)).toBe(card.uri);
    expect(getThreadUri('https://youtu.be/x', { data: card, isLoading: false }, true)).toBe(card.uri);
  });

  it('is nothing while the card is read, so the thread is read once', () => {
    expect(getThreadUri(card.uri, { data: undefined, isLoading: true }, true)).toBeNull();
  });

  it.each([
    ['without a card', { data: null, isLoading: false }, true],
    ['when Pinakes is not configured', { data: undefined, isLoading: true }, false],
  ])('is the page’s link %s', (_name, read, configured) => {
    expect(getThreadUri('https://example.com/a', read, configured)).toBe('https://example.com/a');
  });

  it('is nothing without a link', () => {
    expect(getThreadUri(null, { data: null, isLoading: false }, true)).toBeNull();
  });
});
