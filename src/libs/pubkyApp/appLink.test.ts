import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppLinkReference, isRunningHostUrl } from './appLink';

const AUTHOR = fakeOwner(7);
const POST_ID = '00357R34CQ8Q0';
/** The test page's own origin (`http://localhost:3000`): the host the app runs on. */
const HERE = window.location.origin;
const POST = { kind: 'post', compositeId: `${AUTHOR}:${POST_ID}` };
const USER = { kind: 'user', pubky: AUTHOR };

describe('getAppLinkReference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a post link on the host the app runs on as the post', () => {
    expect(getAppLinkReference(`${HERE}/post/${AUTHOR}/${POST_ID}`)).toEqual(POST);
  });

  it('reads a profile link on the host the app runs on as the user', () => {
    expect(getAppLinkReference(`${HERE}/profile/${AUTHOR}`)).toEqual(USER);
    expect(getAppLinkReference(`${HERE}/profile/${AUTHOR}/`)).toEqual(USER);
  });

  it('ignores the query, the fragment, a trailing slash, the case of the host and surrounding spaces', () => {
    const host = window.location.host.toUpperCase();
    expect(getAppLinkReference(`  http://${host}/post/${AUTHOR}/${POST_ID}/?ref=share#replies `)).toEqual(POST);
  });

  it('ignores a leading www.', () => {
    expect(getAppLinkReference(`http://www.${window.location.host}/post/${AUTHOR}/${POST_ID}`)).toEqual(POST);
  });

  it('keeps a link to another host as it is: another instance of the app too', () => {
    expect(getAppLinkReference(`https://pubky.app/post/${AUTHOR}/${POST_ID}`)).toBeNull();
    expect(getAppLinkReference(`https://example.com/profile/${AUTHOR}`)).toBeNull();
    // The same name on another port is another host
    expect(getAppLinkReference(`http://${window.location.hostname}:3001/post/${AUTHOR}/${POST_ID}`)).toBeNull();
  });

  it.each([
    ['a collection', `/collections/${AUTHOR}/${POST_ID}`],
    ['a profile tab', `/profile/${AUTHOR}/followers`],
    ['the own profile route', '/profile'],
    ['settings', '/settings/media'],
    ['a post link without its id', `/post/${AUTHOR}`],
    ['a post path one segment too deep', `/post/${AUTHOR}/${POST_ID}/x`],
  ])('keeps another page of the app (%s) as a link', (_, path) => {
    expect(getAppLinkReference(`${HERE}${path}`)).toBeNull();
  });

  it.each(['0', '00', '003', '00357R34CQ8Q', '00357R34CQ8Q1', POST_ID.toLowerCase(), `${POST_ID}0`])(
    'keeps a post link with the post id %s, which the data model refuses, without throwing',
    (id) => {
      expect(getAppLinkReference(`${HERE}/post/${AUTHOR}/${id}`)).toBeNull();
    },
  );

  it.each([
    ['one character short', AUTHOR.slice(0, 51)],
    ['52 characters that are no public key', 'a'.repeat(52)],
    ['in upper case', AUTHOR.toUpperCase()],
    ['with the pk: prefix', `pk:${AUTHOR}`],
  ])('keeps a link with a key %s', (_, key) => {
    expect(getAppLinkReference(`${HERE}/post/${key}/${POST_ID}`)).toBeNull();
    expect(getAppLinkReference(`${HERE}/profile/${key}`)).toBeNull();
  });

  it('leaves pubky URIs, composite ids, relative routes and other schemes alone', () => {
    expect(getAppLinkReference(`pubky://${AUTHOR}/pub/social/v1/posts/${POST_ID}`)).toBeNull();
    expect(getAppLinkReference(`pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`)).toBeNull();
    expect(getAppLinkReference(`${AUTHOR}:${POST_ID}`)).toBeNull();
    expect(getAppLinkReference(`/post/${AUTHOR}/${POST_ID}`)).toBeNull();
    expect(getAppLinkReference(`ftp://${window.location.host}/post/${AUTHOR}/${POST_ID}`)).toBeNull();
    expect(getAppLinkReference('')).toBeNull();
    expect(getAppLinkReference('not a link')).toBeNull();
  });

  it('maps nothing during server rendering, where there is no host to compare', () => {
    vi.stubGlobal('window', undefined);
    expect(isRunningHostUrl(new URL('http://localhost:3000/x'))).toBe(false);
    expect(getAppLinkReference(`http://localhost:3000/post/${AUTHOR}/${POST_ID}`)).toBeNull();
  });
});
