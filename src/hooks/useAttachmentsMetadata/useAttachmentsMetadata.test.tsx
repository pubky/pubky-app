import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { FileDetailsModel } from '@/models/file/fileDetails';
import { toast } from '@/molecules/Toaster/toast';
import { NexusFileService } from '@/services/nexus/file/file';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { useAttachmentsMetadata } from './useAttachmentsMetadata';

vi.mock('@/services/nexus/file/file', () => ({ NexusFileService: { fetchFiles: vi.fn() } }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const fileUri = (fileId: string) => `pubky://${AUTHOR}/pub/pubky.app/files/${fileId}`;
const createFileRow = (fileId: string): NexusFileDetails => ({
  id: `${AUTHOR}:${fileId}`,
  name: `${fileId}.jpg`,
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
const articleProps = {
  content: JSON.stringify({ title: 'Title', body: 'Body' }),
  coverImageVariant: FileVariant.FEED,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useAttachmentsMetadata with real Dexie subscriptions', () => {
  beforeEach(() => {
    vi.mocked(NexusFileService.fetchFiles).mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders a file row that lands after the post details did', async () => {
    const { result } = renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1')] }));
    await waitFor(() => expect(NexusFileService.fetchFiles).toHaveBeenCalledWith([fileUri('image1')]));
    expect(result.current.files).toEqual([]);

    await act(async () => {
      await FileDetailsModel.table.put(createFileRow('image1'));
    });
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image1')]));
  });

  it('returns local rows while fetching and persisting only the missing ones', async () => {
    await FileDetailsModel.table.put(createFileRow('image1'));
    const pending = deferred<NexusFileDetails[]>();
    vi.mocked(NexusFileService.fetchFiles).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1'), fileUri('image2')] }));
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image1')]));
    expect(NexusFileService.fetchFiles).toHaveBeenCalledWith([fileUri('image2')]);

    await act(async () => {
      pending.resolve([createFileRow('image2')]);
    });
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image1'), createFileRow('image2')]));
  });

  it('does not re-request a URI whose fetch settled with no row', async () => {
    const read = vi.spyOn(FileController, 'getMetadata');
    renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1'), fileUri('image2')] }));
    await waitFor(() => expect(NexusFileService.fetchFiles).toHaveBeenCalledTimes(1));
    await act(async () => {
      await FileDetailsModel.table.put(createFileRow('image2'));
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(NexusFileService.fetchFiles).toHaveBeenCalledTimes(1);
  });

  it('reports a failed fetch once without duplicating the factory log', async () => {
    const log = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    vi.mocked(NexusFileService.fetchFiles).mockImplementation(async () => {
      throw Err.network(NetworkErrorCode.OFFLINE, 'offline', { service: ErrorService.Nexus, operation: 'fetchFiles' });
    });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAttachmentsMetadata({ fileUris: [fileUri('image1'), fileUri('image2')], onError }),
    );
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    await act(async () => {
      await FileDetailsModel.table.put(createFileRow('image2'));
    });
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image2')]));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(NexusFileService.fetchFiles).toHaveBeenCalledTimes(1);
  });

  it('reports a model read failure without duplicating its factory log', async () => {
    const log = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(FileDetailsModel.table, 'where').mockImplementation(() => {
      throw new Error('database failure');
    });
    const onError = vi.fn();
    renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1')], onError }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain(':findByIds]');
  });

  it('does not resolve anything while the caller gate is off', async () => {
    const read = vi.spyOn(FileController, 'getMetadata');
    const { result } = renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1')], enabled: false }));
    await act(async () => {
      await FileDetailsModel.table.put(createFileRow('image1'));
    });
    expect(result.current.files).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(NexusFileService.fetchFiles).not.toHaveBeenCalled();
  });

  it('waits for a replacement cover locally without fetching or showing a false toast', async () => {
    await FileDetailsModel.table.bulkPut([createFileRow('image1'), createFileRow('image2')]);
    vi.mocked(NexusFileService.fetchFiles).mockRejectedValue(new Error('Nexus unavailable'));
    const { result, rerender } = renderHook(
      ({ id }) => usePostArticle({ ...articleProps, attachments: [fileUri(id)] }),
      { initialProps: { id: 'image1' } },
    );
    await waitFor(() => expect(result.current.coverImage?.alt).toBe('image1.jpg'));
    rerender({ id: 'image2' });
    await waitFor(() => expect(result.current.coverImage?.alt).toBe('image2.jpg'));
    expect(NexusFileService.fetchFiles).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not fetch a changed URI while disabled, then reads its cache when re-enabled', async () => {
    await FileDetailsModel.table.bulkPut([createFileRow('image1'), createFileRow('image2')]);
    const read = vi.spyOn(FileController, 'getMetadata');
    const { result, rerender } = renderHook(
      ({ id, enabled }) => useAttachmentsMetadata({ fileUris: [fileUri(id)], enabled }),
      { initialProps: { id: 'image1', enabled: true } },
    );
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image1')]));
    rerender({ id: 'image2', enabled: false });
    await act(async () => {
      await FileDetailsModel.table.put(createFileRow('image3'));
    });
    expect(result.current.files).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(NexusFileService.fetchFiles).not.toHaveBeenCalled();
    rerender({ id: 'image2', enabled: true });
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image2')]));
    expect(NexusFileService.fetchFiles).not.toHaveBeenCalled();
  });

  it('does not treat the previous cache miss as a miss for a cached replacement', async () => {
    await FileDetailsModel.table.put(createFileRow('image2'));
    const { result, rerender } = renderHook(({ id }) => useAttachmentsMetadata({ fileUris: [fileUri(id)] }), {
      initialProps: { id: 'image1' },
    });
    await waitFor(() => expect(NexusFileService.fetchFiles).toHaveBeenCalledWith([fileUri('image1')]));
    rerender({ id: 'image2' });
    await waitFor(() => expect(result.current.files).toEqual([createFileRow('image2')]));
    expect(NexusFileService.fetchFiles).toHaveBeenCalledTimes(1);
  });

  it.each(['local read', 'fetch'] as const)('does not toast when a pending %s fails after unmount', async (source) => {
    const pending = deferred<NexusFileDetails[]>();
    const request =
      source === 'local read'
        ? vi.spyOn(FileController, 'getMetadata').mockReturnValue(pending.promise)
        : vi.mocked(NexusFileService.fetchFiles).mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePostArticle({ ...articleProps, attachments: [fileUri('image1')] }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    unmount();
    await act(async () => {
      pending.reject(new Error('deferred failure'));
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(['local read', 'fetch'] as const)(
    'keeps the replacement cover when an old pending %s fails',
    async (source) => {
      await FileDetailsModel.table.put(createFileRow('image2'));
      const pending = deferred<NexusFileDetails[]>();
      const request =
        source === 'local read'
          ? vi.spyOn(FileController, 'getMetadata').mockReturnValueOnce(pending.promise)
          : vi.mocked(NexusFileService.fetchFiles).mockReturnValueOnce(pending.promise);
      const { result, rerender } = renderHook(
        ({ id }) => usePostArticle({ ...articleProps, attachments: [fileUri(id)] }),
        { initialProps: { id: 'image1' } },
      );
      await waitFor(() => expect(request).toHaveBeenCalled());
      rerender({ id: 'image2' });
      await waitFor(() => expect(result.current.coverImage?.alt).toBe('image2.jpg'));
      await act(async () => {
        pending.reject(new Error('obsolete failure'));
      });
      expect(result.current.coverImage?.alt).toBe('image2.jpg');
      expect(toast).not.toHaveBeenCalled();
    },
  );

  it('suppresses a pending failure after disabling its consumer', async () => {
    const pending = deferred<NexusFileDetails[]>();
    vi.mocked(NexusFileService.fetchFiles).mockReturnValue(pending.promise);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useAttachmentsMetadata({ fileUris: [fileUri('image1')], enabled, onError }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(NexusFileService.fetchFiles).toHaveBeenCalled());
    rerender({ enabled: false });
    await act(async () => {
      pending.reject(new Error('deferred failure'));
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('allows a pending fetch to persist after unmount', async () => {
    const pending = deferred<NexusFileDetails[]>();
    vi.mocked(NexusFileService.fetchFiles).mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useAttachmentsMetadata({ fileUris: [fileUri('image1')] }));
    await waitFor(() => expect(NexusFileService.fetchFiles).toHaveBeenCalled());
    unmount();
    await act(async () => {
      pending.resolve([createFileRow('image1')]);
    });
    await waitFor(async () =>
      expect(await FileDetailsModel.table.get(createFileRow('image1').id)).toEqual(createFileRow('image1')),
    );
  });
});
