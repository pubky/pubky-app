import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddContentInput } from './useAddContentForm.utils';

const AUTHOR = fakeOwner(1);
const POST_ID = '00357R34CQ8Q0';
const COMPOSITE_ID = `${AUTHOR}:${POST_ID}`;
/** The test page's own origin: the host the app runs on. */
const HERE = window.location.origin;

describe('parseAddContentInput', () => {
  it.each([
    ['a post link', `${HERE}/post/${AUTHOR}/${POST_ID}`],
    ['a post link with a query', `${HERE}/post/${AUTHOR}/${POST_ID}?ref=share`],
    ['a post link with www.', `http://www.${window.location.host}/post/${AUTHOR}/${POST_ID}`],
    ['a v1 post reference', `pubky://${AUTHOR}/pub/social/v1/posts/${POST_ID}`],
    ['a 0.x post reference', `pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`],
  ])('reads %s as the post', (_, value) => {
    expect(parseAddContentInput(value)).toEqual({ type: 'post', compositeId: COMPOSITE_ID });
  });

  it.each([
    ['a YouTube link', 'https://www.youtube.com/watch?v=P65ZQL_m9zs'],
    ['an OpenStreetMap link', 'https://www.openstreetmap.org/relation/1682248'],
    ['a pubky.app page that is no post', 'https://pubky.app/profile/'],
    ['the bookmarks page', 'https://pubky.app/collections/bookmarks'],
    ['a /post/ path without a key', 'https://pubky.app/post/'],
    ['a plain http link', 'http://example.com'],
    ['a collection path on another host', `https://example.com/collections/${AUTHOR}/${POST_ID}`],
    ['a /post/ path cut short on another host', `https://example.com/post/${AUTHOR}/0035`],
    ['a post link on another host', `https://example.com/post/${AUTHOR}/${POST_ID}`],
    ['a post link on another instance of the app', `https://pubky.app/post/${AUTHOR}/${POST_ID}`],
    ['a collection link on another instance of the app', `https://pubky.app/collections/${AUTHOR}/${POST_ID}`],
    ['a profile tab of the app', `${HERE}/profile/${AUTHOR}/followers`],
  ])('reads %s as a link, as written', (_, value) => {
    expect(parseAddContentInput(`  ${value} `)).toEqual({ type: 'link', uri: value });
  });

  it('reads a link without its tracking parameters', () => {
    expect(parseAddContentInput('https://www.youtube.com/watch?v=P65ZQL_m9zs&si=Ab1cD2&feature=shared')).toEqual({
      type: 'link',
      uri: 'https://www.youtube.com/watch?v=P65ZQL_m9zs',
    });
    expect(parseAddContentInput('https://example.com/a?id=7&utm_source=x&fbclid=y')).toEqual({
      type: 'link',
      uri: 'https://example.com/a?id=7',
    });
  });

  it('spells a capitalised scheme in lower case', () => {
    expect(parseAddContentInput('Https://www.youtube.com/watch?v=P65ZQL_m9zs')).toEqual({
      type: 'link',
      uri: 'https://www.youtube.com/watch?v=P65ZQL_m9zs',
    });
  });

  it.each([
    ['empty text', '', 'Enter a valid URL.'],
    ['text that is no URL', 'youtube video', 'Enter a valid URL.'],
    ['a link without a host', 'https://', 'Enter a valid URL.'],
    ['a scheme a collection cannot hold', 'ftp://example.com/file', 'Enter a valid URL.'],
    ['an identifier that is no link', 'isbn:9781119473862', 'Enter a valid URL.'],
    ['a link with a space', 'https://example.com/a b', 'Enter a valid URL.'],
    ['a link over 1024 characters', `https://example.com/${'a'.repeat(1100)}`, 'Enter a valid URL.'],
    [
      'a Pubky object that is no post',
      `pubky://${AUTHOR}/pub/social/v1/profile.json`,
      'Only Pubky posts can be added.',
    ],
    ['a profile link', `${HERE}/profile/${AUTHOR}`, 'Only Pubky posts can be added.'],
    ['a collection link', `${HERE}/collections/${AUTHOR}/${POST_ID}`, 'Collection can not be added to a collection.'],
    ['a post link cut short', `${HERE}/post/${AUTHOR}/0035`, 'Enter a valid post URL.'],
    ['a post link without its id', `${HERE}/post/${AUTHOR}`, 'Enter a valid post URL.'],
  ])('refuses %s', (_, value, message) => {
    expect(parseAddContentInput(value)).toEqual({ type: 'invalid', message });
  });

  describe('during server rendering', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reads every web link as a link, as written: there is no host to compare', () => {
      const link = `http://localhost:3000/post/${AUTHOR}/${POST_ID}`;
      vi.stubGlobal('window', undefined);

      expect(parseAddContentInput(link)).toEqual({ type: 'link', uri: link });
    });
  });
});
