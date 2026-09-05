import { describe, expect, it } from 'vitest';
import { buildSessionBridgeFrameAncestors, parseSessionBridgeAllowlist } from '@/libs/session-bridge/allowlist';
import nextConfig from '../../../next.config';

describe('next.config session-bridge headers', () => {
  it('matches the runtime allowlist used by isAllowedBridgeOrigin', async () => {
    const config = nextConfig as {
      headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
    };
    expect(typeof config.headers).toBe('function');
    const routes = await config.headers!();
    const bridge = routes.find((route) => route.source === '/session-bridge');
    expect(bridge).toBeDefined();

    const allowlist = parseSessionBridgeAllowlist(process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS);
    const csp = bridge!.headers.find((header) => header.key === 'Content-Security-Policy');
    expect(csp?.value).toBe(`frame-ancestors ${buildSessionBridgeFrameAncestors(allowlist)}`);
    expect(csp?.value).toContain('https://vibes.pubky.app');
    expect(csp?.value).toContain('https://shop.pubky.app');
    expect(bridge!.headers.map((header) => header.key)).toEqual([
      'Content-Security-Policy',
      'Referrer-Policy',
      'X-Robots-Tag',
    ]);
  });
});
