import { describe, expect, it, vi } from 'vitest';
import { ClientRegionService } from '@/services/client-region/client-region';
import { ClientRegionApplication } from './client-region';

vi.mock('@/services/client-region/client-region', () => ({
  ClientRegionService: { fetchCountry: vi.fn() },
}));

describe('ClientRegionApplication.fetchCountry', () => {
  it('returns what the service reads', async () => {
    vi.mocked(ClientRegionService.fetchCountry).mockResolvedValue({ status: 'ready', country: 'GB' });

    await expect(ClientRegionApplication.fetchCountry()).resolves.toEqual({ status: 'ready', country: 'GB' });
  });

  it('passes an unavailable route through as a value', async () => {
    vi.mocked(ClientRegionService.fetchCountry).mockResolvedValue({ status: 'unavailable' });

    await expect(ClientRegionApplication.fetchCountry()).resolves.toEqual({ status: 'unavailable' });
  });
});
