import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostDetails } from './usePostDetails';

// Mock direct dependencies
const mockReadPostDetails = vi.fn();
const mockFetch = vi.fn().mockResolvedValue(undefined);
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getDetails: (params: { compositeId: string }) => mockReadPostDetails(params),
    fetch: (params: { compositeId: string }) => mockFetch(params),
  },
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => Promise<unknown>, _deps: unknown[], defaultValue: unknown) => {
    // Execute the query function to trigger it
    queryFn();
    // Return the mock value based on what mockReadPostDetails returns
    const result = mockReadPostDetails.mock.results[mockReadPostDetails.mock.results.length - 1];
    return result?.value ?? defaultValue;
  },
}));

describe('usePostDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPostDetails.mockReturnValue(null);
  });

  it('returns loading state initially when compositeId is null', () => {
    const { result } = renderHook(() => usePostDetails(null));

    // When compositeId is null, the query returns null but mock returns undefined (default)
    // This is the expected behavior since the hook defaults to undefined
    expect(result.current.isLoading).toBe(true);
  });

  it('returns post details when compositeId is valid', () => {
    const mockPost = {
      id: 'post-123',
      author_id: 'user-123',
      content: 'Test post content',
      indexed_at: '2024-01-01T00:00:00.000Z',
    };
    mockReadPostDetails.mockReturnValue(mockPost);

    const { result } = renderHook(() => usePostDetails('user-123:post-123'));

    expect(result.current.postDetails).toEqual(mockPost);
    expect(result.current.isLoading).toBe(false);
  });

  it('calls PostController.getDetails with correct compositeId', () => {
    const mockPost = {
      id: 'post-456',
      author_id: 'user-456',
      content: 'Another test post',
      indexed_at: '2024-01-02T00:00:00.000Z',
    };
    mockReadPostDetails.mockReturnValue(mockPost);

    renderHook(() => usePostDetails('user-456:post-456'));

    expect(mockReadPostDetails).toHaveBeenCalledWith({ compositeId: 'user-456:post-456' });
  });

  it('returns loading state when post is not found (null from DB)', () => {
    // When DB returns null, the mock's ?? operator falls back to defaultValue (undefined)
    // This represents the "loading" state in the hook's perspective
    mockReadPostDetails.mockReturnValue(null);

    const { result } = renderHook(() => usePostDetails('user-999:post-999'));

    // In real usage, Dexie would return null which the hook would receive
    // With our mock, undefined is returned, indicating loading state
    expect(result.current.isLoading).toBe(true);
  });

  it('does not call getPostDetails when compositeId is null', () => {
    renderHook(() => usePostDetails(null));

    // The query function returns early with null, so getPostDetails is never called
    expect(mockReadPostDetails).not.toHaveBeenCalled();
  });

  it('does not call getDetails when enabled is false', () => {
    renderHook(() => usePostDetails('user-123:post-123', { enabled: false }));

    expect(mockReadPostDetails).not.toHaveBeenCalled();
  });

  it('does not call getPostDetails when compositeId is undefined', () => {
    renderHook(() => usePostDetails(undefined));

    // The query function returns early with null, so getPostDetails is never called
    expect(mockReadPostDetails).not.toHaveBeenCalled();
  });
});

describe('usePostDetails - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPostDetails.mockReturnValue(null);
  });

  it('matches snapshot for valid post', () => {
    const mockPost = {
      id: 'snapshot-post',
      author_id: 'snapshot-user',
      content: 'A post for snapshot testing',
      indexed_at: '2024-01-01T00:00:00.000Z',
      tags: [],
      attachments: [],
    };
    mockReadPostDetails.mockReturnValue(mockPost);

    const { result } = renderHook(() => usePostDetails('snapshot-user:snapshot-post'));

    expect(result.current).toMatchSnapshot();
  });

  it('matches snapshot for null compositeId', () => {
    const { result } = renderHook(() => usePostDetails(null));

    expect(result.current).toMatchSnapshot();
  });

  it('matches snapshot for not found post', () => {
    mockReadPostDetails.mockReturnValue(null);

    const { result } = renderHook(() => usePostDetails('user-999:post-999'));

    expect(result.current).toMatchSnapshot();
  });
});
