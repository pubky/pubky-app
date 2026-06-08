import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFollowDisplayName, resolveFollowToastDisplayName } from './useFollowUser.utils';

const mockGetDetails = vi.fn();

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getDetails: (...args: unknown[]) => mockGetDetails(...args),
  },
}));

describe('resolveFollowDisplayName', () => {
  it('returns the provided name unchanged', () => {
    expect(resolveFollowDisplayName('user-123', 'Alice')).toBe('Alice');
  });

  it('formats and truncates pubky when name is missing', () => {
    const pubky = 'abcdefghijklmnopqrstuvwxyz012345678901234567890';
    const result = resolveFollowDisplayName(pubky);

    expect(result).not.toBe(pubky);
    expect(result.length).toBeLessThanOrEqual(15);
  });
});

describe('resolveFollowToastDisplayName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDetails.mockResolvedValue(null);
  });

  it('returns the provided name unchanged', async () => {
    await expect(resolveFollowToastDisplayName('user-123', 'Alice')).resolves.toBe('Alice');
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('uses profile name from local cache when name is missing', async () => {
    mockGetDetails.mockResolvedValue({ name: 'Bob' });

    await expect(resolveFollowToastDisplayName('user-123')).resolves.toBe('Bob');
    expect(mockGetDetails).toHaveBeenCalledWith({ userId: 'user-123' });
  });

  it('falls back to formatted pubky when profile has no name', async () => {
    mockGetDetails.mockResolvedValue({ name: null });
    const pubky = 'abcdefghijklmnopqrstuvwxyz012345678901234567890';

    const result = await resolveFollowToastDisplayName(pubky);

    expect(result).not.toBe(pubky);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('falls back to formatted pubky when profile lookup fails', async () => {
    mockGetDetails.mockRejectedValue(new Error('lookup failed'));
    const pubky = 'abcdefghijklmnopqrstuvwxyz012345678901234567890';

    const result = await resolveFollowToastDisplayName(pubky);

    expect(result).not.toBe(pubky);
    expect(result.length).toBeLessThanOrEqual(15);
  });
});
