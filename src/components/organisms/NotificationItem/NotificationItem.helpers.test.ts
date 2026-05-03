import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePubkyToNames } from './NotificationItem.helpers';

// Valid 52-char lowercase alphanumeric keys for testing
const PUBKY_A = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
const PUBKY_B = 'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvutsrqponmlk';

const { mockGetOrFetchDetails } = vi.hoisted(() => ({
  mockGetOrFetchDetails: vi.fn(),
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getOrFetchDetails: mockGetOrFetchDetails,
  },
}));

describe('resolvePubkyToNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns content unchanged when there are no mentions', async () => {
    const result = await resolvePubkyToNames('Hello world');
    expect(result).toBe('Hello world');
    expect(mockGetOrFetchDetails).not.toHaveBeenCalled();
  });

  it('resolves pk: prefixed mention to user name', async () => {
    mockGetOrFetchDetails.mockResolvedValue({ name: 'Alice' });

    const result = await resolvePubkyToNames(`pk:${PUBKY_A} said hello`);

    expect(mockGetOrFetchDetails).toHaveBeenCalledWith({ userId: PUBKY_A });
    expect(result).toBe('@Alice said hello');
  });

  it('resolves pubky prefixed mention to user name', async () => {
    mockGetOrFetchDetails.mockResolvedValue({ name: 'Bob' });

    const result = await resolvePubkyToNames(`pubky${PUBKY_A} said hello`);

    expect(mockGetOrFetchDetails).toHaveBeenCalledWith({ userId: PUBKY_A });
    expect(result).toBe('@Bob said hello');
  });

  it('resolves multiple different mentions', async () => {
    mockGetOrFetchDetails.mockResolvedValueOnce({ name: 'Alice' }).mockResolvedValueOnce({ name: 'Bob' });

    const result = await resolvePubkyToNames(`pk:${PUBKY_A} and pubky${PUBKY_B} are friends`);

    expect(mockGetOrFetchDetails).toHaveBeenCalledTimes(2);
    expect(result).toBe('@Alice and @Bob are friends');
  });

  it('deduplicates repeated mentions and fetches each user only once', async () => {
    mockGetOrFetchDetails.mockResolvedValueOnce({ name: 'Alice' }).mockResolvedValueOnce({ name: 'Bob' });

    const result = await resolvePubkyToNames(
      `pk:${PUBKY_A} tagged pk:${PUBKY_B} then pk:${PUBKY_B} replied to pk:${PUBKY_A} and pk:${PUBKY_A} joined`,
    );

    expect(mockGetOrFetchDetails).toHaveBeenCalledTimes(2);
    expect(result).toBe('@Alice tagged @Bob then @Bob replied to @Alice and @Alice joined');
  });

  it('keeps original mention when fetchDetails returns no name', async () => {
    mockGetOrFetchDetails.mockResolvedValue({ name: null });

    const mention = `pk:${PUBKY_A}`;
    const result = await resolvePubkyToNames(`${mention} said hello`);

    expect(result).toBe(`${mention} said hello`);
  });

  it('keeps original mention when fetchDetails throws', async () => {
    mockGetOrFetchDetails.mockRejectedValue(new Error('Network error'));

    const mention = `pk:${PUBKY_A}`;
    const result = await resolvePubkyToNames(`${mention} said hello`);

    expect(result).toBe(`${mention} said hello`);
  });
});
