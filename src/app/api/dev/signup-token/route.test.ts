import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('/api/dev/signup-token', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to development mode
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('HOMESERVER_ADMIN_URL', 'http://localhost:6288/generate_signup_token');
    vi.stubEnv('HOMESERVER_ADMIN_PASSWORD', 'test-password');
  });

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalEnv);
  });

  it('should return 403 in production mode without Cypress', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CYPRESS', undefined);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('non-production environments');
  });

  it('should allow access in production with Cypress flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CYPRESS', 'true');

    mockFetch.mockResolvedValue(new Response('test-token', { status: 200 }));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe('test-token');
  });

  it('should generate token successfully in development', async () => {
    mockFetch.mockResolvedValue(new Response('generated-token-123', { status: 200 }));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe('generated-token-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:6288/generate_signup_token',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'X-Admin-Password': 'test-password',
        },
      }),
    );
  });

  it('should trim whitespace from token', async () => {
    mockFetch.mockResolvedValue(new Response('  token-with-spaces  \n', { status: 200 }));

    const response = await GET();
    const data = await response.json();

    expect(data.token).toBe('token-with-spaces');
  });

  it('should return error when homeserver returns non-OK status', async () => {
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('Failed to generate signup token');
  });

  it('should return error when no token received', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('No token received');
  });

  it('should return error when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to connect to homeserver admin');
  });
});

describe('/api/dev/signup-token - missing credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    // Unset credentials
    vi.stubEnv('HOMESERVER_ADMIN_URL', '');
    vi.stubEnv('HOMESERVER_ADMIN_PASSWORD', '');
  });

  it('should return 500 when credentials are not configured', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Homeserver admin credentials not configured');
  });
});
