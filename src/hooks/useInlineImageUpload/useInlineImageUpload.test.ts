import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { useInlineImageUpload } from './useInlineImageUpload';
import { INLINE_IMAGE_UPLOAD_REJECTION_NAME } from './useInlineImageUpload.types';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast');

const mockCreateObjectURL = vi.fn(() => `blob:mock-${mockCreateObjectURL.mock.calls.length}`);
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const fileUri = (id: string) => `pubky://${PUBKY}/pub/pubky.app/files/${id}`;

const imageFile = (name = 'pic.png', type = 'image/png', size = 1024) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const setup = (overrides?: Partial<Parameters<typeof useInlineImageUpload>[0]>) =>
  renderHook((props: Parameters<typeof useInlineImageUpload>[0]) => useInlineImageUpload(props), {
    initialProps: { enabled: true, authorPubky: PUBKY, getInlineBudget: () => 9, ...overrides },
  });

describe('useInlineImageUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadInlineImage', () => {
    it('uploads a valid image and resolves with the file URI', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('a'));
      const { result } = setup();

      let uri: string | undefined;
      await act(async () => {
        uri = await result.current.uploadInlineImage(imageFile());
      });

      expect(uri).toBe(fileUri('a'));
      expect(FileController.commitCreate).toHaveBeenCalledWith({ file: expect.any(File), pubky: PUBKY });
      expect(result.current.getPreviewUrl(fileUri('a'))).toMatch(/^blob:mock-/);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('rejects when disabled or unauthenticated', async () => {
      const disabled = setup({ enabled: false });
      await expect(disabled.result.current.uploadInlineImage(imageFile())).rejects.toThrow();

      const noAuthor = setup({ authorPubky: null });
      await expect(noAuthor.result.current.uploadInlineImage(imageFile())).rejects.toThrow();

      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('rejects unsupported MIME types with a toast', async () => {
      const { result } = setup();

      await expect(result.current.uploadInlineImage(imageFile('a.mp4', 'video/mp4'))).rejects.toThrow();

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Unsupported file type') }),
      );
      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('rejects oversized images with a toast', async () => {
      const { result } = setup();

      await expect(
        result.current.uploadInlineImage(imageFile('big.png', 'image/png', 21 * 1024 * 1024)),
      ).rejects.toThrow();

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('exceeds') }),
      );
      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('rejects when the inline budget is exhausted, tagged for the global handler', async () => {
      const { result } = setup({ getInlineBudget: () => 0 });

      await expect(result.current.uploadInlineImage(imageFile())).rejects.toMatchObject({
        name: INLINE_IMAGE_UPLOAD_REJECTION_NAME,
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Articles support up to') }),
      );
      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('rejects an over-budget batch wholesale without uploading anything', async () => {
      const { result } = setup({ getInlineBudget: () => 2 });

      // Three files dropped together with two slots left: MDXEditor inserts
      // all-or-nothing, so partial uploads would be wasted — reject them all
      let batch!: Promise<string>[];
      act(() => {
        batch = [
          result.current.uploadInlineImage(imageFile('a.png')),
          result.current.uploadInlineImage(imageFile('b.png')),
          result.current.uploadInlineImage(imageFile('c.png')),
        ];
      });

      for (const upload of batch) {
        await expect(upload).rejects.toMatchObject({ name: INLINE_IMAGE_UPLOAD_REJECTION_NAME });
      }
      expect(FileController.commitCreate).not.toHaveBeenCalled();
      expect(result.current.uploadingCount).toBe(0);
      // One toast for the whole batch
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Articles support up to') }),
      );
    });

    it('uploads a same-tick batch that fits the budget', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(fileUri('a')).mockResolvedValueOnce(fileUri('b'));
      const { result } = setup({ getInlineBudget: () => 2 });

      let batch!: Promise<string>[];
      act(() => {
        batch = [
          result.current.uploadInlineImage(imageFile('a.png')),
          result.current.uploadInlineImage(imageFile('b.png')),
        ];
      });

      await act(async () => {
        await expect(Promise.all(batch)).resolves.toEqual([fileUri('a'), fileUri('b')]);
      });
      expect(FileController.commitCreate).toHaveBeenCalledTimes(2);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('counts in-flight uploads from earlier batches against the budget', async () => {
      let resolveFirst!: (uri: string) => void;
      vi.mocked(FileController.commitCreate).mockImplementation(
        () => new Promise<string>((resolve) => (resolveFirst = resolve)),
      );
      const { result } = setup({ getInlineBudget: () => 1 });

      let first!: Promise<string>;
      act(() => {
        first = result.current.uploadInlineImage(imageFile('a.png'));
      });
      await waitFor(() => expect(result.current.uploadingCount).toBe(1));

      // A second, separate drop while the first upload is still in flight
      let second!: Promise<string>;
      act(() => {
        second = result.current.uploadInlineImage(imageFile('b.png'));
      });

      await expect(second).rejects.toMatchObject({ name: INLINE_IMAGE_UPLOAD_REJECTION_NAME });
      expect(FileController.commitCreate).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFirst(fileUri('a'));
        await first;
      });
      expect(result.current.uploadingCount).toBe(0);
    });

    it('toasts and rethrows when the upload fails, tagged for the global handler', async () => {
      vi.mocked(FileController.commitCreate).mockRejectedValue(new Error('network down'));
      const { result } = setup();

      await expect(result.current.uploadInlineImage(imageFile())).rejects.toMatchObject({
        message: 'network down',
        name: INLINE_IMAGE_UPLOAD_REJECTION_NAME,
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'Could not upload image. Try again.' }),
      );
      expect(result.current.getPreviewUrl(fileUri('a'))).toBeNull();
    });

    it('tracks uploadingCount while uploads are in flight', async () => {
      let resolveUpload!: (uri: string) => void;
      vi.mocked(FileController.commitCreate).mockImplementation(
        () => new Promise<string>((resolve) => (resolveUpload = resolve)),
      );
      const { result } = setup();

      let pending!: Promise<string>;
      act(() => {
        pending = result.current.uploadInlineImage(imageFile());
      });

      await waitFor(() => expect(result.current.uploadingCount).toBe(1));

      await act(async () => {
        resolveUpload(fileUri('a'));
        await pending;
      });

      expect(result.current.uploadingCount).toBe(0);
    });
  });

  describe('session lifecycle', () => {
    const uploadTwo = async (result: { current: ReturnType<typeof useInlineImageUpload> }) => {
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(fileUri('a')).mockResolvedValueOnce(fileUri('b'));
      await act(async () => {
        await result.current.uploadInlineImage(imageFile('a.png'));
        await result.current.uploadInlineImage(imageFile('b.png'));
      });
    };

    it('finalizeSession deletes only unreferenced uploads and clears the session', async () => {
      const { result } = setup();
      await uploadTwo(result);

      await act(async () => {
        await result.current.finalizeSession([fileUri('a')]);
      });

      expect(FileController.commitDelete).toHaveBeenCalledTimes(1);
      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('b')] });
      // Referenced upload keeps its object URL (ownership moves to the localFiles store)
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
      expect(result.current.getPreviewUrl(fileUri('a'))).toBeNull();
    });

    it('finalizeSession with everything referenced deletes nothing', async () => {
      const { result } = setup();
      await uploadTwo(result);

      await act(async () => {
        await result.current.finalizeSession([fileUri('a'), fileUri('b')]);
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
    });

    it('discardSession deletes every session upload and revokes previews', async () => {
      const { result } = setup();
      await uploadTwo(result);

      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('a'), fileUri('b')] });
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('cleanup failures are swallowed', async () => {
      vi.mocked(FileController.commitDelete).mockRejectedValue(new Error('offline'));
      const { result } = setup();
      await uploadTwo(result);

      await act(async () => {
        await expect(result.current.discardSession()).resolves.toBeUndefined();
      });
    });

    it('registerSessionUpload joins external uploads to the session', async () => {
      const { result } = setup();

      act(() => {
        result.current.registerSessionUpload(fileUri('cover'), imageFile('cover.png'));
      });

      expect(result.current.getPreviewUrl(fileUri('cover'))).toMatch(/^blob:mock-/);

      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('cover')] });
    });

    it('does not delete session files while a commit is in flight', async () => {
      const { result } = setup();
      await uploadTwo(result);

      act(() => {
        result.current.setCommitting(true);
      });
      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();

      // After the commit settles, discards work again
      act(() => {
        result.current.setCommitting(false);
      });
      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('a'), fileUri('b')] });
    });

    it('cleans up an upload that resolves after the session was discarded', async () => {
      let resolveUpload!: (uri: string) => void;
      vi.mocked(FileController.commitCreate).mockImplementation(
        () => new Promise<string>((resolve) => (resolveUpload = resolve)),
      );
      const { result } = setup();

      let pending!: Promise<string>;
      act(() => {
        pending = result.current.uploadInlineImage(imageFile());
      });
      await waitFor(() => expect(result.current.uploadingCount).toBe(1));

      // Discard while the upload is still in flight (e.g. dialog closed)
      await act(async () => {
        await result.current.discardSession();
      });
      expect(FileController.commitDelete).not.toHaveBeenCalled(); // nothing in the session yet

      await act(async () => {
        resolveUpload(fileUri('late'));
        await expect(pending).rejects.toThrow();
      });

      // The late arrival deleted itself instead of orphaning the file
      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('late')] });
      expect(result.current.getPreviewUrl(fileUri('late'))).toBeNull();
    });

    it('discards the session on unmount', async () => {
      const { result, unmount } = setup();
      await uploadTwo(result);

      unmount();

      await waitFor(() => {
        expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('a'), fileUri('b')] });
      });
    });

    it('discards the session when article mode is disabled', async () => {
      const { result, rerender } = setup();
      await uploadTwo(result);

      rerender({ enabled: false, authorPubky: PUBKY, getInlineBudget: () => 9 });

      await waitFor(() => {
        expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('a'), fileUri('b')] });
      });
    });

    it('unmount after finalize is a no-op', async () => {
      const { result, unmount } = setup();
      await uploadTwo(result);

      await act(async () => {
        await result.current.finalizeSession([fileUri('a'), fileUri('b')]);
      });
      unmount();

      expect(FileController.commitDelete).not.toHaveBeenCalled();
    });
  });

  describe('buildLocalAttachmentEntries', () => {
    it('maps session URIs to object-URL entries and unknown URIs to null', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('a'));
      const { result } = setup();

      await act(async () => {
        await result.current.uploadInlineImage(imageFile('a.png', 'image/png'));
      });

      const entries = result.current.buildLocalAttachmentEntries([fileUri('kept-old'), fileUri('a')]);

      expect(entries[0]).toBeNull();
      expect(entries[1]).toEqual({
        type: 'image/png',
        name: 'a.png',
        urls: { main: expect.stringMatching(/^blob:mock-/), feed: expect.stringMatching(/^blob:mock-/) },
      });
    });
  });
});
