import { describe, expect, it } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { chooseNativeEmbed, getNativeEmbedCard, getShowPostLabel } from './nativeEmbed.utils';

describe('getShowPostLabel', () => {
  it('names the site, or X without one, to show or close the post', () => {
    expect(getShowPostLabel('x.com', false)).toBe('Show on x.com');
    expect(getShowPostLabel('x.com', true)).toBe('Close the x.com post');
    expect(getShowPostLabel(null, false)).toBe('Show on X');
  });
});

describe('chooseNativeEmbed', () => {
  it.each([
    [{ hasCard: true, hasAlsoOn: true }, 'card'],
    [{ hasCard: true, hasAlsoOn: false }, 'embed'],
    [{ hasCard: false, hasAlsoOn: false }, 'embed'],
    [{ hasCard: true, hasAlsoOn: false, embedFailed: true }, 'card'],
    [{ hasCard: false, hasAlsoOn: false, embedFailed: true }, 'embed'],
    [{ hasCard: true, hasAlsoOn: true, engaged: true }, 'embed'],
    [{ hasCard: true, hasAlsoOn: false, upFront: false }, 'card'],
    [{ hasCard: false, hasAlsoOn: false, upFront: false }, 'embed'],
    [{ hasCard: true, hasAlsoOn: false, embedFailed: true, upFront: false }, 'card'],
  ] as const)('%o -> %s', (input, expected) => {
    expect(chooseNativeEmbed(input)).toBe(expected);
  });
});

describe('getNativeEmbedCard', () => {
  it('keeps a read card with a name', () => {
    expect(getNativeEmbedCard(videoFixture)).toBe(videoFixture);
  });

  it.each([
    ['no card', null],
    ['a pending card', { ...videoFixture, status: 'pending' }],
    ['a failed read', { ...videoFixture, status: 'error' }],
    ['a card without a name', { ...videoFixture, name: '  ' }],
  ])('drops %s', (_, card) => {
    expect(getNativeEmbedCard(card as typeof videoFixture | null)).toBeNull();
  });

  it('leaves out a description that only repeats the name (a post)', () => {
    const card = getNativeEmbedCard({ ...videoFixture, name: 'Hello', description: ' Hello ' });
    expect(card?.description).toBeNull();
    expect(card?.name).toBe('Hello');
  });
});
