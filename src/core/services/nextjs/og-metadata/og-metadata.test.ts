import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQueryNextjs = vi.hoisted(() => vi.fn());
const mockFetchOgMetadata = vi.hoisted(() => vi.fn());

vi.mock('../nextjs.utils', () => ({
  queryNextjs: mockQueryNextjs,
}));

vi.mock('./og-metadata.utils', () => ({
  fetchOgMetadata: mockFetchOgMetadata,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NextJsOgMetadataService', () => {
  let NextJsOgMetadataService: typeof import('./og-metadata').NextJsOgMetadataService;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    mockQueryNextjs.mockImplementation(({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn());
    mockFetchOgMetadata.mockResolvedValue({ url: 'https://example.com/', title: 'Test', image: null, type: 'website' });

    const mod = await import('./og-metadata');
    NextJsOgMetadataService = mod.NextJsOgMetadataService;
  });

  it('should pass url string and hostname to fetchOgMetadata via queryFn', async () => {
    await NextJsOgMetadataService.fetch(new URL('https://example.com/page'));

    expect(mockFetchOgMetadata).toHaveBeenCalledWith('https://example.com/page', 'example.com');
  });

  it('should return the result from queryNextjs', async () => {
    const expected = { url: 'https://example.com/', title: 'Hello', image: null, type: 'website' as const };
    mockFetchOgMetadata.mockResolvedValue(expected);

    const result = await NextJsOgMetadataService.fetch(new URL('https://example.com'));

    expect(result).toEqual(expected);
  });

  it('should normalize URL with trailing slash via URL.toString()', async () => {
    await NextJsOgMetadataService.fetch(new URL('https://example.com'));

    expect(mockQueryNextjs).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/' }));
    expect(mockFetchOgMetadata).toHaveBeenCalledWith('https://example.com/', 'example.com');
  });
});
