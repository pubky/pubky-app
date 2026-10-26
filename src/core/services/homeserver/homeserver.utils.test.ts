import { describe, expect, it } from 'vitest';
import { mockRingSession } from '@/test-utils/pubky';
import { resolveOwnedSessionPath } from './homeserver.utils';

const PUBKY = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rdo';
const OTHER = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
const session = mockRingSession(['/:rw'], PUBKY);
const allowedPrefixes = ['/pub/', '/priv/'] as const;

describe('resolveOwnedSessionPath', () => {
  it('resolves a public and a private path of the session owner, in every spelling', () => {
    for (const path of ['/pub/pubky.app/posts/0032SSN7Q4EVG', '/priv/social/v1/_migrated.json']) {
      for (const url of [path, `pubky://${PUBKY}${path}`, `pubky${PUBKY}${path}`]) {
        expect(resolveOwnedSessionPath({ url, session, allowedPrefixes })).toEqual({ session, path });
      }
    }
  });

  it('is null without a session, for another owner, and outside the writable roots', () => {
    const path = '/priv/social/v1/feeds/x.json';
    expect(resolveOwnedSessionPath({ url: path, session: null, allowedPrefixes })).toBeNull();
    expect(resolveOwnedSessionPath({ url: `pubky://${OTHER}${path}`, session, allowedPrefixes })).toBeNull();
    expect(resolveOwnedSessionPath({ url: `pubky://${PUBKY}/events/`, session, allowedPrefixes })).toBeNull();
  });

  it('honours the roots it is given: a private path is not owned when only /pub/ is writable', () => {
    const url = `pubky://${PUBKY}/priv/social/v1/mutes/${OTHER}.json`;
    expect(resolveOwnedSessionPath({ url, session, allowedPrefixes: ['/pub/'] })).toBeNull();
    expect(resolveOwnedSessionPath({ url, session, allowedPrefixes })).not.toBeNull();
  });
});
