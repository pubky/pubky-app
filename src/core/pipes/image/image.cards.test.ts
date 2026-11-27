import { describe, expect, it } from 'vitest';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import {
  getBorrowingGroupId,
  getCardImageUrls,
  getCardPreviewLink,
  getEpisodePageImageUrls,
  getGroupImageUrls,
} from './image.cards';

const member = (image: string | null): TPinakesCard => ({
  id: 'm',
  uri: 'https://www.wikidata.org/wiki/Q1',
  status: 'ok',
  type_path: [],
  also_on: [],
  open_in: [],
  refs: [],
  collections: 0,
  image,
});

describe('getCardImageUrls', () => {
  it('lists the card’s own image and its latest episodes’ art, once each, in one spelling', () => {
    expect(
      getCardImageUrls({
        status: 'ok',
        image: 'https://CDN.example/show.jpg',
        episodes: [
          { uri: 'https://a.example/1', guid: '1', image: 'https://cdn.example/1.jpg' },
          { uri: 'https://a.example/2', guid: '2', image: 'https://cdn.example/show.jpg' },
          { uri: 'https://a.example/3', guid: '3', image: null },
        ],
      }),
    ).toEqual(['https://cdn.example/show.jpg', 'https://cdn.example/1.jpg']);
  });

  it('leaves out what the route never reads', () => {
    expect(getCardImageUrls({ status: 'ok', image: 'pubky://a/pub/x.png', episodes: null })).toEqual([]);
    expect(getCardImageUrls({ status: 'ok', image: null })).toEqual([]);
  });

  it('serves nothing of a card Pinakes is still reading', () => {
    expect(getCardImageUrls({ status: 'pending', image: 'https://cdn.example/x.jpg' })).toEqual([]);
  });

  it.each(['missing', 'unreachable', 'error'])('serves the image of a %s card, which still shows it', (status) => {
    expect(getCardImageUrls({ status, image: 'https://cdn.example/x.jpg' })).toEqual(['https://cdn.example/x.jpg']);
  });
});

describe('getGroupImageUrls', () => {
  it('lists every member’s own image', () => {
    expect(
      getGroupImageUrls({
        members: [
          member('https://upload.wikimedia.org/a.jpg'),
          member(null),
          member('https://i.scdn.co/b'),
          { ...member('https://pending.example/c.jpg'), status: 'pending' },
        ],
      }),
    ).toEqual(['https://upload.wikimedia.org/a.jpg', 'https://i.scdn.co/b']);
  });
});

describe('getEpisodePageImageUrls', () => {
  it('lists the art of the episodes on the page', () => {
    expect(
      getEpisodePageImageUrls({
        items: [
          { uri: 'https://feeds.example/?guid=1', guid: '1', image: 'https://feeds.example/1.jpg' },
          { uri: 'https://feeds.example/?guid=2', guid: '2', image: null },
        ],
      }),
    ).toEqual(['https://feeds.example/1.jpg']);
  });
});

describe('getBorrowingGroupId', () => {
  it('names a group with another member only', () => {
    expect(getBorrowingGroupId({ status: 'ok', group: { id: 'g', size: 3 } })).toBe('g');
    expect(getBorrowingGroupId({ status: 'ok', group: { id: 'g', size: 1 } })).toBeNull();
    expect(getBorrowingGroupId({ status: 'ok', group: null })).toBeNull();
    expect(getBorrowingGroupId({ status: 'pending', group: { id: 'g', size: 3 } })).toBeNull();
  });
});

describe('getCardPreviewLink', () => {
  it('reads the card’s own web link, else the address it is opened at, else a web link people wrote', () => {
    expect(getCardPreviewLink({ uri: 'https://a.example/x', open_in: [], refs: [] })).toBe('https://a.example/x');
    expect(
      getCardPreviewLink({ uri: 'btc:block/1', open_in: [], refs: ['isbn:1', 'https://mempool.space/block/1'] }),
    ).toBe('https://mempool.space/block/1');
    expect(getCardPreviewLink({ uri: 'isbn:1', open_in: [], refs: ['https://u:p@a.example/'] })).toBeNull();
  });
});
