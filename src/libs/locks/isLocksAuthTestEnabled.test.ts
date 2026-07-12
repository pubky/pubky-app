// TODO:[Locks] #2040 — delete with isLocksAuthTestEnabled when the test hook is removed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from '@/libs/env/env';
import { isLocksAuthTestEnabled } from './isLocksAuthTestEnabled';

vi.mock('@/libs/env/env', () => ({ Env: { NODE_ENV: 'production' } }));

const setNodeEnv = (value: 'development' | 'production' | 'test') => {
  Env.NODE_ENV = value;
};

const setHostname = (hostname: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname },
  });
};

describe('isLocksAuthTestEnabled', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    setNodeEnv('production');
  });

  afterEach(() => {
    vi.unstubAllGlobals(); // restore window first (SSR test stubs it to undefined)
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('allows any host on a local dev build', () => {
    setNodeEnv('development');
    setHostname('pubky.app'); // even a prod-looking host
    expect(isLocksAuthTestEnabled()).toBe(true);
  });

  it('allows on a test build', () => {
    setNodeEnv('test');
    expect(isLocksAuthTestEnabled()).toBe(true);
  });

  it('allows the staging host on a production build', () => {
    setHostname('staging.pubky.app');
    expect(isLocksAuthTestEnabled()).toBe(true);
  });

  it('allows PR-preview hosts on a production build', () => {
    setHostname('pubky-app-pr-2137.some-vercel.app');
    expect(isLocksAuthTestEnabled()).toBe(true);
  });

  it('blocks the real production host', () => {
    setHostname('pubky.app');
    expect(isLocksAuthTestEnabled()).toBe(false);
  });

  it('blocks a prod subdomain that is not staging/preview', () => {
    setHostname('www.pubky.app');
    expect(isLocksAuthTestEnabled()).toBe(false);
  });

  it('blocks an unknown host', () => {
    setHostname('evil.example.com');
    expect(isLocksAuthTestEnabled()).toBe(false);
  });

  it('fails closed under SSR (no window) on a production build', () => {
    vi.stubGlobal('window', undefined);
    expect(isLocksAuthTestEnabled()).toBe(false);
  });
});
