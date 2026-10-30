import { describe, expect, it } from 'vitest';
import { getHomeserverCapabilities, HOMESERVER_CAPABILITIES, isStagingHomeserverDeploy } from '@/config/network';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';

/** Run with PUBKY_RUNTIME_* overrides, restoring env and memoized config after. */
function withRuntimeEnv(overrides: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetRuntimeConfigForTests();
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetRuntimeConfigForTests();
  }
}

describe('isStagingHomeserverDeploy', () => {
  it('is false for a declared production deploy', () => {
    withRuntimeEnv({ PUBKY_RUNTIME_ENV: 'production' }, () => {
      expect(isStagingHomeserverDeploy()).toBe(false);
    });
  });

  it('is true for a declared staging deploy', () => {
    withRuntimeEnv({ PUBKY_RUNTIME_ENV: 'staging' }, () => {
      expect(isStagingHomeserverDeploy()).toBe(true);
    });
  });

  it('stays true on staging when homeserver config drifts from the canonical defaults', () => {
    // Regression: the guard is driven by the declared PUBKY_RUNTIME_ENV, not
    // by config equality with the compiled-in staging defaults — drift used to
    // silently disable it and re-enable the force-republish path.
    withRuntimeEnv(
      {
        PUBKY_RUNTIME_ENV: 'staging',
        PUBKY_RUNTIME_HOMESERVER: 'rotated-staging-homeserver-key',
      },
      () => {
        expect(isStagingHomeserverDeploy()).toBe(true);
      },
    );
  });
});

describe('HOMESERVER_CAPABILITIES', () => {
  it('pins the sign-in grant: the 0.x tree, the social v1 trees and the Locks entries, in Ring order', () => {
    expect(HOMESERVER_CAPABILITIES).toBe(
      '/pub/pubky.app/:rw,/pub/social/v1/:rw,/priv/social/v1/:rw,/priv/app.pubky/v1/:rw,/priv/social/:rw,/priv/app.locks/content/:r',
    );
  });
});

describe('embedded Shop initial permissions', () => {
  it.each(['production', 'staging'])('includes Shop storage permissions by default on %s', (deployEnv) => {
    withRuntimeEnv({ PUBKY_RUNTIME_ENV: deployEnv }, () => {
      const scopes = getHomeserverCapabilities().split(',');
      expect(scopes).toEqual([
        '/pub/pubky.app/:rw',
        '/pub/social/v1/:rw',
        '/priv/social/v1/:rw',
        '/priv/app.pubky/v1/:rw',
        '/priv/social/:rw',
        '/priv/app.locks/content/:r',
        '/pub/paykit/:rw',
        '/priv/pubky.app/:rw',
        '/pub/chat/v0/:rw',
        '/priv/chat/v0/:rw',
      ]);
      expect(new Set(scopes).size).toBe(scopes.length);
      expect(scopes.some((scope) => scope.split(':')[1].includes('e'))).toBe(false);
    });
  });
});
