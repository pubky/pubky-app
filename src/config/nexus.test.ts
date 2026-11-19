import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getV1CdnUrl, NEXUS_V1_STATIC_PATH } from '@/config/nexus';
import { getCdnUrl } from '@/libs/runtime-config/runtime-config';

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getCdnUrl: vi.fn(),
}));

describe('getV1CdnUrl', () => {
  beforeEach(() => {
    vi.mocked(getCdnUrl).mockReset();
  });

  it.each([
    ['https://nexus.staging.pubky.app/static', 'https://nexus.staging.pubky.app/v1/static'],
    ['https://nexus.staging.pubky.app/static/', 'https://nexus.staging.pubky.app/v1/static'],
    ['http://localhost:8080/static', 'http://localhost:8080/v1/static'],
    ['https://example.com/proxy/static', 'https://example.com/proxy/v1/static'],
    ['https://example.com', 'https://example.com/v1/static'],
    ['https://example.com/', 'https://example.com/v1/static'],
    // Only the trailing segment is the static base.
    ['https://static.example.com/static', 'https://static.example.com/v1/static'],
  ])('derives the v1 base from the CDN value %s', (cdnUrl, v1CdnUrl) => {
    vi.mocked(getCdnUrl).mockReturnValue(cdnUrl);

    expect(getV1CdnUrl()).toBe(v1CdnUrl);
  });

  it('reads the runtime value at call time', () => {
    vi.mocked(getCdnUrl)
      .mockReturnValueOnce('https://a.example/static')
      .mockReturnValueOnce('https://b.example/static');

    expect(getV1CdnUrl()).toBe('https://a.example/v1/static');
    expect(getV1CdnUrl()).toBe('https://b.example/v1/static');
  });

  it('keeps the prefix the Nexus contract names', () => {
    expect(NEXUS_V1_STATIC_PATH).toBe('/v1/static');
  });
});
