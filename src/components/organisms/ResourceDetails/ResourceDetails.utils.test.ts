import { describe, expect, it } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getThreadUri } from './ResourceDetails.utils';

describe('getThreadUri', () => {
  const card: TPinakesResourceDetail = { ...(videoFixture as TPinakesResourceDetail), refs: ['https://youtu.be/x'] };

  it('is the page’s link once the card is read, never the card’s canonical link', () => {
    expect(getThreadUri(card.uri, { data: card, isLoading: false }, true)).toBe(card.uri);
    expect(getThreadUri('https://youtu.be/x', { data: card, isLoading: false }, true)).toBe('https://youtu.be/x');
  });

  it('is a web link of the card on an identifier’s page', () => {
    const book = { ...card, uri: 'isbn:9780140328721', refs: ['https://openlibrary.org/isbn/9780140328721'] };
    expect(getThreadUri(book.uri, { data: book, isLoading: false }, true)).toBe(book.refs[0]);
  });

  it('is nothing while the card is read, so the thread is read once', () => {
    expect(getThreadUri(card.uri, { data: undefined, isLoading: true }, true)).toBeNull();
  });

  it.each([
    ['without a card', { data: null, isLoading: false }, true],
    ['when Pinakes is not configured', { data: undefined, isLoading: true }, false],
  ])('is the page’s link %s, folded as with a card', (_name, read, configured) => {
    expect(getThreadUri('https://example.com/a', read, configured)).toBe('https://example.com/a');
    expect(getThreadUri('HTTPS://Example.com/a#top', read, configured)).toBe('https://example.com/a');
  });

  it('is nothing without a link', () => {
    expect(getThreadUri(null, { data: null, isLoading: false }, true)).toBeNull();
  });
});
