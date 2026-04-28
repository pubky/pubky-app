import { describe, it, expect, vi, beforeEach } from 'vitest';
// Create stable mock references via vi.hoisted so they're shared
// between the vi.mock factories and the test assertions
const { mockResolve4, mockIsIP, mockIsIpSafe } = vi.hoisted(() => ({
  mockResolve4: vi.fn<(hostname: string) => Promise<string[]>>(),
  mockIsIP: vi.fn<(input: string) => number>(),
  mockIsIpSafe: vi.fn<(ip: string) => boolean>(),
}));

vi.mock('dns/promises', () => ({
  default: { resolve4: mockResolve4 },
  resolve4: mockResolve4,
}));

vi.mock('net', () => ({
  default: { isIP: mockIsIP },
  isIP: mockIsIP,
}));

vi.mock('@/libs/network/network', () => ({
  isIpSafe: mockIsIpSafe,
}));

// Helpers for creating mock responses
const createMockReader = (chunks: Uint8Array[]) => {
  let index = 0;
  return {
    read: vi.fn().mockImplementation(() => {
      if (index < chunks.length) {
        return Promise.resolve({ done: false, value: chunks[index++] });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
    cancel: vi.fn(),
  };
};

const createHtmlResponse = (html: string, headers: Record<string, string> = {}) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'content-type': 'text/html', ...headers }),
  body: {
    getReader: () => createMockReader([new TextEncoder().encode(html)]),
  },
});

const createRedirectResponse = (status: number, location: string) => {
  const cancel = vi.fn().mockResolvedValue(undefined);
  return {
    ok: false,
    status,
    statusText: 'Found',
    headers: new Headers({ location }),
    body: { getReader: () => createMockReader([]), cancel },
    _cancel: cancel,
  };
};

const simpleHtml = (title: string) =>
  `<!DOCTYPE html><html><head><meta property="og:title" content="${title}" /></head><body></body></html>`;

/**
 * Integration tests for OgMetadataApplication.
 *
 * These tests verify the full stack (application → service → utils) working together
 * as a blackbox. Unit-level tests for individual functions live in:
 * - src/core/services/nextjs/nextjs.utils.test.ts (validateDns, readResponseBody, normalizeImageUrl)
 * - src/core/services/nextjs/og-metadata/og-metadata.utils.test.ts (fetchOgMetadata)
 * - src/core/services/nextjs/og-metadata/og-metadata.test.ts (NextJsOgMetadataService)
 */
describe('OgMetadataApplication (integration)', () => {
  let OgMetadataApplication: typeof import('./og-metadata').OgMetadataApplication;
  const mockFetch = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default mocks: hostname resolves to safe public IP
    mockIsIP.mockReturnValue(0);
    mockResolve4.mockResolvedValue(['1.1.1.1']);
    mockIsIpSafe.mockReturnValue(true);

    // Mock global fetch (used by safeFetch in the service utils layer)
    global.fetch = mockFetch;

    // Re-import modules after reset so all references are fresh
    ({ OgMetadataApplication } = await import('./og-metadata'));

    // Default mock: successful HTML response
    mockFetch.mockResolvedValue(createHtmlResponse(simpleHtml('Test Title')));
  });

  describe('happy path', () => {
    it('should fetch and return OG metadata for a valid URL', async () => {
      mockFetch.mockResolvedValue(createHtmlResponse(simpleHtml('Example Title')));

      const result = await OgMetadataApplication.fetch(new URL('http://example.com'));

      expect(result).toMatchObject({
        title: 'Example Title',
        type: 'website',
      });
    });
  });

  describe('redirect handling', () => {
    it('should follow redirects with DNS validation on each hop', async () => {
      const redirectResponse = createRedirectResponse(302, 'https://example.org/page');

      mockFetch
        .mockResolvedValueOnce(redirectResponse)
        .mockResolvedValueOnce(createHtmlResponse(simpleHtml('Redirected Page')));

      mockResolve4.mockResolvedValue(['1.1.1.1']);

      const result = await OgMetadataApplication.fetch(new URL('https://example.com'));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('https://example.com/');
      expect(mockFetch.mock.calls[1][0]).toBe('https://example.org/page');
      expect(redirectResponse._cancel).toHaveBeenCalled();
      expect(mockResolve4).toHaveBeenCalledWith('example.com');
      expect(mockResolve4).toHaveBeenCalledWith('example.org');
      expect(result.title).toBe('Redirected Page');
    });

    it('should block redirects to private IPs (SSRF via open redirect)', async () => {
      const redirectResponse = createRedirectResponse(302, 'http://169.254.169.254/metadata');
      mockFetch.mockResolvedValueOnce(redirectResponse);

      mockResolve4.mockResolvedValueOnce(['1.1.1.1']);
      mockIsIP.mockReturnValueOnce(0).mockReturnValueOnce(4);
      mockIsIpSafe.mockReturnValueOnce(true).mockReturnValueOnce(false);

      await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow('Blocked IP range');
      expect(redirectResponse._cancel).toHaveBeenCalled();
    });

    it('should throw on too many redirects', async () => {
      for (let i = 0; i < 5; i++) {
        mockFetch.mockResolvedValueOnce(createRedirectResponse(302, `https://example.org/redirect${i}`));
      }

      await expect(OgMetadataApplication.fetch(new URL('https://example.com'))).rejects.toThrow('Too many redirects');
    });
  });
});
