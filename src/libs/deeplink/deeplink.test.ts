import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeployEnv } from '@/libs/runtime-config/runtime-config.schema';
import { generateBitkitContactDeeplink, toAndroidAuthIntentUrl, toBitkitIosAuthUrl } from './deeplink';

const { network } = vi.hoisted(() => ({ network: { deployEnv: 'production' as DeployEnv } }));
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  getDeployEnv: () => network.deployEnv,
}));

describe('generateBitkitContactDeeplink', () => {
  it('builds the contact link Bitkit routes to its add-contact screen', () => {
    expect(generateBitkitContactDeeplink('pubkylockcreator')).toBe('bitkit://contact?pubky=pubkylockcreator');
  });

  // Bitkit rejects a link whose value carries anything outside the key, so the value is always encoded.
  it('encodes the pubky', () => {
    expect(generateBitkitContactDeeplink('key&other=value')).toBe('bitkit://contact?pubky=key%26other%3Dvalue');
  });
});

describe('toBitkitIosAuthUrl', () => {
  it('opens the same grant in Bitkit without changing query order or encoding', () => {
    const query =
      'caps=%2Fpub%2Fpubky.app%2F%3Arw%2C%2Fpriv%2Fsocial%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key&label=a+b%20c&label=%2f';

    expect(toBitkitIosAuthUrl(`pubkyauth://signin_grant?${query}`)).toBe(`bitkit://pubky-auth/signin?${query}`);
  });

  it.each([
    ['legacy Ring sign-in', 'pubkyauth://signin?caps=x&secret=s'],
    ['sign-up', 'pubkyauth://signup?invite=test'],
    ['grant without a query', 'pubkyauth://signin_grant'],
    ['grant with an empty query', 'pubkyauth://signin_grant?'],
    ['web link', 'https://pubky.app/?secret=s'],
    ['Bitkit link', 'bitkit://pubky-auth/signin?caps=x&secret=s'],
    ['empty URL', ''],
  ])('leaves a %s unchanged', (_, url) => {
    expect(toBitkitIosAuthUrl(url)).toBe(url);
  });
});

describe('toAndroidAuthIntentUrl', () => {
  const grantQuery =
    'caps=%2Fpub%2Fpubky.app%2F%3Arw%2C%2Fpriv%2Fsocial%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key&label=a+b%20c&label=%2f';
  const grantUrl = `pubkyauth://signin_grant?${grantQuery}`;

  afterEach(() => {
    network.deployEnv = 'production';
  });

  it.each([
    { deployEnv: 'production', ring: 'to.pubky.ring', bitkit: 'to.bitkit' },
    { deployEnv: 'staging', ring: 'to.pubky.ring', bitkit: 'to.bitkit.dev' },
  ] as const)('targets the $deployEnv signer packages', ({ deployEnv, ring, bitkit }) => {
    network.deployEnv = deployEnv;

    expect(toAndroidAuthIntentUrl(grantUrl, 'ring')).toBe(
      `intent://signin_grant?${grantQuery}#Intent;scheme=pubkyauth;package=${ring};end`,
    );
    expect(toAndroidAuthIntentUrl(grantUrl, 'bitkit')).toBe(
      `intent://signin_grant?${grantQuery}#Intent;scheme=pubkyauth;package=${bitkit};end`,
    );
  });

  it('names the signer package and preserves the grant payload byte for byte', () => {
    expect(toAndroidAuthIntentUrl(grantUrl, 'ring')).toBe(
      `intent://signin_grant?${grantQuery}#Intent;scheme=pubkyauth;package=to.pubky.ring;end`,
    );
    expect(toAndroidAuthIntentUrl(grantUrl, 'bitkit')).toBe(
      `intent://signin_grant?${grantQuery}#Intent;scheme=pubkyauth;package=to.bitkit;end`,
    );
  });

  it('supports canonical signup_grant URLs and semicolons in query parameters', () => {
    expect(toAndroidAuthIntentUrl('pubkyauth://signup_grant/path?a=%3B%23&b=;&c', 'ring')).toBe(
      'intent://signup_grant/path?a=%3B%23&b=;&c#Intent;scheme=pubkyauth;package=to.pubky.ring;end',
    );
  });

  it.each([
    ['empty URL', ''],
    ['missing scheme', 'signin_grant?secret=abc'],
    ['web scheme', 'https://signin_grant?secret=abc'],
    ['uppercase scheme', 'PUBKYAUTH://signin_grant?secret=abc'],
    ['ring scheme', 'pubkyring://signin_grant?secret=abc'],
    ['legacy signin host', 'pubkyauth://signin?secret=abc'],
    ['legacy signup host', 'pubkyauth://signup?secret=abc'],
    ['missing host', 'pubkyauth:///signin_grant?secret=abc'],
    ['non-grant host', 'pubkyauth://signin_grant.example?secret=abc'],
    ['user info', 'pubkyauth://user@signin_grant?secret=abc'],
    ['port', 'pubkyauth://signin_grant:1?secret=abc'],
    ['empty query', 'pubkyauth://signin_grant?'],
    ['injected intent fragment', 'pubkyauth://signin_grant?secret=abc#Intent;package=evil.app;end'],
    ['empty fragment', 'pubkyauth://signin_grant?secret=abc#'],
    ['whitespace in query', 'pubkyauth://signin_grant?label=a b'],
  ])('refuses non-canonical URL (%s) and keeps the plain link', (_, url) => {
    expect(toAndroidAuthIntentUrl(url, 'ring')).toBe(url);
    expect(toAndroidAuthIntentUrl(url, 'bitkit')).toBe(url);
  });
});
