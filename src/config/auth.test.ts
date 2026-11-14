import { ENGINE_CAPS, MIGRATION_CAPS } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { APP_CAPABILITIES, LOCKS_CAPABILITIES, SHOP_CAPABILITIES, SOCIAL_V1_APP_CAPABILITIES } from '@/config/auth';
import { getHomeserverCapabilities, HOMESERVER_CAPABILITIES } from '@/config/network';
import { hasCapabilities } from '@/libs/auth/capabilities';

describe('SHOP_CAPABILITIES', () => {
  it('pins the shared five-scope App/Shop contract without access to other Chat versions', () => {
    expect(SHOP_CAPABILITIES).toEqual([
      '/pub/pubky.app/:rw',
      '/pub/paykit/:rw',
      '/priv/pubky.app/:rw',
      '/pub/chat/v0/:rw',
      '/priv/chat/v0/:rw',
    ]);
  });
});

describe('social v1 capabilities', () => {
  it('keeps the 0.x tree and adds the three v1 scopes explicitly, not through the Locks entry', () => {
    expect(APP_CAPABILITIES).toBe('/pub/pubky.app/:rw');
    expect(SOCIAL_V1_APP_CAPABILITIES).toEqual(['/pub/social/v1/:rw', '/priv/social/v1/:rw', '/priv/app.pubky/v1/:rw']);
    expect(LOCKS_CAPABILITIES).toEqual(['/priv/social/:rw', '/priv/app.locks/content/:r']);
  });

  it('pins the grant every Ring sign-in requests, in this order', () => {
    expect(HOMESERVER_CAPABILITIES).toBe(
      '/pub/pubky.app/:rw,/pub/social/v1/:rw,/priv/social/v1/:rw,/priv/app.pubky/v1/:rw,/priv/social/:rw,/priv/app.locks/content/:r',
    );
  });

  it('pins the one-approval grant with the Shop scopes appended once', () => {
    expect(getHomeserverCapabilities()).toBe(
      `${HOMESERVER_CAPABILITIES},/pub/paykit/:rw,/priv/pubky.app/:rw,/pub/chat/v0/:rw,/priv/chat/v0/:rw`,
    );
  });

  it.each([
    ['the migration engine', ENGINE_CAPS],
    ['the migrating app', MIGRATION_CAPS],
  ])('covers what pubky-social-specs declares for %s', (_, required) => {
    expect(hasCapabilities(HOMESERVER_CAPABILITIES.split(','), required.split(','))).toBe(true);
    expect(hasCapabilities(getHomeserverCapabilities().split(','), required.split(','))).toBe(true);
  });

  it('is not covered by a grant from before the port', () => {
    expect(hasCapabilities([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], MIGRATION_CAPS.split(','))).toBe(false);
  });
});
