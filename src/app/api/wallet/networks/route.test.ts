import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('wallet checkout networks', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('exposes only the networks and keeps unknown values unset', async () => {
    vi.stubEnv('WALLET_NETWORK', 'mainnet');
    vi.stubEnv('WALLET_LOCKS_NETWORK', 'unknown');
    vi.stubEnv('WALLET_BRIDGE_SECRET', 'private');
    let response = GET();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ walletNetwork: 'mainnet', locksNetwork: null });
    vi.stubEnv('WALLET_LOCKS_NETWORK', 'regtest');
    response = GET();
    expect(await response.json()).toEqual({ walletNetwork: 'mainnet', locksNetwork: 'regtest' });
  });
});
