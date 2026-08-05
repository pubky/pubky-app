import { describe, expect, it } from 'vitest';
import { isStagingHomeserverDeploy } from '@/config/network';
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
