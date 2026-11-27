import { afterEach, describe, expect, it, vi } from 'vitest';

describe('appServer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('shares links on the app origin in a server build', async () => {
    const { getShareOrigin, HAS_APP_SERVER } = await import('./appServer');
    expect(HAS_APP_SERVER).toBe(true);
    expect(getShareOrigin()).toBe(window.location.origin);
  });

  it('shares links on the public web app in the static export, whose origin is private', async () => {
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', 'true');
    const { getShareOrigin, HAS_APP_SERVER } = await import('./appServer');
    expect(HAS_APP_SERVER).toBe(false);
    expect(getShareOrigin()).toBe('https://pubky.app');
  });

  it('builds a report email to the support address with the post link', async () => {
    const { getReportMailto } = await import('./appServer');
    expect(getReportMailto('https://pubky.app/post/a/b')).toBe(
      'mailto:hello@pubky.com?subject=Report%20post&body=https%3A%2F%2Fpubky.app%2Fpost%2Fa%2Fb',
    );
  });
});
