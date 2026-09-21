import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { useAttachmentsMetadata } from './useAttachmentsMetadata';

const { liveQueryRegistry, mockGetMetadata, mockFetchFiles } = vi.hoisted(() => ({
  liveQueryRegistry: { rerun: () => undefined },
  mockGetMetadata: vi.fn(),
  mockFetchFiles: vi.fn(),
}));

/**
 * Executable stand-in for `dexie-react-hooks`: it runs the querier the hook
 * hands in, exactly like the real one, and `liveQueryRegistry.rerun()` stands in
 * for a `file_details` write so a row that lands after the first read is
 * observed without remounting the consumer.
 */
vi.mock('dexie-react-hooks', async () => {
  const React = await import('react');
  const reruns = new Set<() => void>();
  liveQueryRegistry.rerun = () => {
    reruns.forEach((rerun) => rerun());
  };

  return {
    useLiveQuery: (querier: () => unknown, deps: unknown[] = [], defaultValue?: unknown) => {
      const [value, setValue] = React.useState(defaultValue);
      const querierRef = React.useRef(querier);
      querierRef.current = querier;

      React.useEffect(() => {
        let cancelled = false;
        const run = () => {
          void Promise.resolve(querierRef.current()).then((result) => {
            if (!cancelled) setValue(result);
          });
        };

        reruns.add(run);
        run();

        return () => {
          cancelled = true;
          reruns.delete(run);
        };
        // The deps list is the hook's own, forwarded verbatim; it is not a literal here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps);

      return value;
    },
  };
});

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getMetadata: mockGetMetadata,
    fetchFiles: mockFetchFiles,
    getFileUrl: vi.fn(),
  },
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const fileUri = (fileId: string) => `pubky://${AUTHOR}/pub/pubky.app/files/${fileId}`;

const createFileRow = (fileId: string, name = 'image.jpg'): NexusFileDetails => ({
  id: `${AUTHOR}:${fileId}`,
  name,
  src: `https://cdn.example.com/${fileId}`,
  content_type: 'image/jpeg',
  size: 1024,
  created_at: 1,
  indexed_at: 1,
  metadata: {},
  owner_id: AUTHOR,
  uri: fileUri(fileId),
  urls: {
    main: `https://cdn.example.com/${fileId}/main`,
    feed: `https://cdn.example.com/${fileId}/feed`,
    small: `https://cdn.example.com/${fileId}/small`,
  },
});

describe('useAttachmentsMetadata', () => {
  beforeEach(() => {
    mockGetMetadata.mockReset();
    mockFetchFiles.mockReset();
  });

  it('renders a file row that lands after the post details did', async () => {
    const localRows: NexusFileDetails[] = [];
    mockGetMetadata.mockImplementation(async () => localRows);
    mockFetchFiles.mockResolvedValue(undefined);
    const attachment = fileUri('image1');

    const { result } = renderHook(() => useAttachmentsMetadata({ fileUris: [attachment] }));

    // The post row is already on screen while the file table is still empty, and
    // the missing metadata has been requested from Nexus.
    await waitFor(() => expect(mockFetchFiles).toHaveBeenCalledWith({ fileUris: [attachment] }));
    expect(result.current.files).toEqual([]);

    // The row lands through a separate write (persistFiles / bootstrap).
    localRows.push(createFileRow('image1'));
    act(() => liveQueryRegistry.rerun());

    await waitFor(() => expect(result.current.files.map((file) => file.name)).toEqual(['image.jpg']));
  });

  it('returns the rows that are local while fetching only the missing ones', async () => {
    const localRows = [createFileRow('image1')];
    mockGetMetadata.mockImplementation(async () => localRows);
    mockFetchFiles.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAttachmentsMetadata({ fileUris: [fileUri('image1'), fileUri('image2')] }),
    );

    await waitFor(() => expect(result.current.files.map((file) => file.name)).toEqual(['image.jpg']));
    expect(mockFetchFiles).toHaveBeenCalledWith({ fileUris: [fileUri('image2')] });
  });

  it('does not re-request a URI whose fetch settled with no row', async () => {
    mockGetMetadata.mockImplementation(async () => []);
    mockFetchFiles.mockResolvedValue(undefined);

    renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1')] }));

    await waitFor(() => expect(mockFetchFiles).toHaveBeenCalledTimes(1));

    // Another write re-runs the live read; the settled URI is not requested again.
    act(() => liveQueryRegistry.rerun());
    await waitFor(() => expect(mockGetMetadata).toHaveBeenCalledTimes(2));
    expect(mockFetchFiles).toHaveBeenCalledTimes(1);
  });

  it('reports a failed fetch once for the current attachment set', async () => {
    mockGetMetadata.mockImplementation(async () => []);
    mockFetchFiles.mockRejectedValue(new Error('offline'));
    const onError = vi.fn();

    renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1')], onError }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    act(() => liveQueryRegistry.rerun());
    await act(async () => {
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockFetchFiles).toHaveBeenCalledTimes(1);
  });

  it('does not resolve anything while the caller gate is off', () => {
    mockGetMetadata.mockResolvedValue([]);
    mockFetchFiles.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAttachmentsMetadata({ fileUris: [fileUri('image1')], enabled: false }),
    );

    expect(result.current.files).toEqual([]);
    expect(mockGetMetadata).not.toHaveBeenCalled();
    expect(mockFetchFiles).not.toHaveBeenCalled();
  });
});