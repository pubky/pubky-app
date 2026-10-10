import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { useInlineMediaUpload } from './useInlineMediaUpload';
import { INLINE_MEDIA_UPLOAD_REJECTION_NAME } from './useInlineMediaUpload.types';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast');

const mockWaitForAuth = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

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

const setup = (overrides?: Partial<Parameters<typeof useInlineMediaUpload>[0]>) =>
  renderHook((props: Parameters<typeof useInlineMediaUpload>[0]) => useInlineMediaUpload(props), {
    initialProps: { enabled: true, authorPubky: PUBKY, getInlineBudget: () => 9, ...overrides },
  });

describe('useInlineMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitForAuth.mockResolvedValue(true);
  });

  describe('uploadInlineMedia', () => {
    it('uploads a valid image and resolves with the file URI', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('a'));
      const { result } = setup();

      let uri: string | undefined;
      await act(async () => {
        uri = await result.current.uploadInlineMedia(imageFile());
      });

      expect(uri).toBe(fileUri('a'));
      expect(FileController.commitCreate).toHaveBeenCalledWith({ file: expect.any(File), pubky: PUBKY });
      expect(result.current.getPreviewUrl(fileUri('a'))).toMatch(/^blob:mock-/);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('waits for authentication before uploading inline video', async () => {
      let authorize!: (authorized: boolean) => void;
      mockWaitForAuth.mockReturnValueOnce(new Promise((resolve) => (authorize = resolve)));
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('video'));
      const { result } = setup();
      const video = imageFile('clip.mp4', 'video/mp4');

      const pending = result.current.uploadInlineMedia(video);
      await waitFor(() => expect(result.current.uploadingCount).toBe(1));
      expect(FileController.commitCreate).not.toHaveBeenCalled();

      await act(async () => {
        authorize(true);
        await expect(pending).resolves.toBe(fileUri('video'));
      });
      expect(FileController.commitCreate).toHaveBeenCalledWith({ file: video, pubky: PUBKY });
      expect(result.current.uploadingCount).toBe(0);
    });

    it.each(['denied', 'discarded'] as const)('cancels a %s upload without a retry toast', async (reason) => {
      let authorize!: (authorized: boolean) => void;
      mockWaitForAuth.mockReturnValueOnce(new Promise((resolve) => (authorize = resolve)));
      const { result } = setup();

      const pending = result.current.uploadInlineMedia(imageFile('clip.mp4', 'video/mp4'));
      await waitFor(() => expect(result.current.uploadingCount).toBe(1));
      await act(async () => {
        if (reason === 'discarded') await result.current.discardSession();
        authorize(reason !== 'denied');
        await expect(pending).rejects.toMatchObject({ name: INLINE_MEDIA_UPLOAD_REJECTION_NAME });
      });

      expect(FileController.commitCreate).not.toHaveBeenCalled();
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
      expect(result.current.uploadingCount).toBe(0);
    });

    it('rejects when disabled or unauthenticated', async () => {
      const disabled = setup({ enabled: false });
      await expect(disabled.result.current.uploadInlineMedia(imageFile())).rejects.toThrow();

      const noAuthor = setup({ authorPubky: null });
      await expect(noAuthor.result.current.uploadInlineMedia(imageFile())).rejects.toThrow();

      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('rejects unsupported MIME types with a toast', async () => {
      const { result } = setup();

      await expect(result.current.uploadInlineMedia(imageFile('a.zip', 'application/zip'))).rejects.toThrow();

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Unsupported file type') }),
      );
      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('rejects oversized images with a toast', async () => {
      const { result } = setup();

      await expect(
        result.current.uploadInlineMedia(imageFile('big.png', 'image/png', 21 * 1024 * 1024)),
      ).rejects.toThrow();

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('exceeds') }),
      );
      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it.each([
      ['video/mp4', 'clip.mp4'],
      ['video/mpeg', 'clip.mpeg'],
      ['audio/mpeg', 'song.mp3'],
      ['audio/wav', 'song.wav'],
      ['application/pdf', 'paper.pdf'],
    ])('uploads %s like an image and records its type and name for the editor', async (type, name) => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('m'));
      const { result } = setup();

      let uri: string | undefined;
      await act(async () => {
        uri = await result.current.uploadInlineMedia(imageFile(name, type));
      });

      expect(uri).toBe(fileUri('m'));
      expect(result.current.getMediaType(fileUri('m'))).toBe(type);
      expect(result.current.getMediaType(fileUri('elsewhere'))).toBeNull();
      expect(result.current.getMediaName(fileUri('m'))).toBe(name);
      expect(result.current.getMediaName(fileUri('elsewhere'))).toBeNull();
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('caps non-image media at the attachment limit, not the image limit', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('v'));
      const { result } = setup();

      // 21 MB is over the image cap but well under the 100 MB file cap
      await act(async () => {
        await result.current.uploadInlineMedia(imageFile('clip.mp4', 'video/mp4', 21 * 1024 * 1024));
      });
      expect(FileController.commitCreate).toHaveBeenCalledTimes(1);

      await expect(
        result.current.uploadInlineMedia(imageFile('huge.mp4', 'video/mp4', 101 * 1024 * 1024)),
      ).rejects.toThrow();
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'File exceeds the 100MB limit.' }),
      );
      expect(FileController.commitCreate).toHaveBeenCalledTimes(1);
    });

    it('toasts kind-specific retry copy when a non-image upload fails', async () => {
      vi.mocked(FileController.commitCreate).mockRejectedValue(new Error('boom'));
      const { result } = setup();

      await expect(result.current.uploadInlineMedia(imageFile('clip.mp4', 'video/mp4'))).rejects.toThrow();
      expect(vi.mocked(toast)).toHaveBeenLastCalledWith(
        expect.objectContaining({ variant: 'error', description: 'Could not upload video. Try again.' }),
      );

      await expect(result.current.uploadInlineMedia(imageFile('paper.pdf', 'application/pdf'))).rejects.toThrow();
      expect(vi.mocked(toast)).toHaveBeenLastCalledWith(
        expect.objectContaining({ variant: 'error', description: 'Could not upload file. Try again.' }),
      );
    });

    it('rejects when the inline budget is exhausted, tagged for the global handler', async () => {
      const { result } = setup({ getInlineBudget: () => 0 });

      await expect(result.current.uploadInlineMedia(imageFile())).rejects.toMatchObject({
        name: INLINE_MEDIA_UPLOAD_REJECTION_NAME,
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
          result.current.uploadInlineMedia(imageFile('a.png')),
          result.current.uploadInlineMedia(imageFile('b.png')),
          result.current.uploadInlineMedia(imageFile('c.png')),
        ];
      });

      for (const upload of batch) {
        await expect(upload).rejects.toMatchObject({ name: INLINE_MEDIA_UPLOAD_REJECTION_NAME });
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
          result.current.uploadInlineMedia(imageFile('a.png')),
          result.current.uploadInlineMedia(imageFile('b.png')),
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
        first = result.current.uploadInlineMedia(imageFile('a.png'));
      });
      await waitFor(() => expect(result.current.uploadingCount).toBe(1));

      // A second, separate drop while the first upload is still in flight
      let second!: Promise<string>;
      act(() => {
        second = result.current.uploadInlineMedia(imageFile('b.png'));
      });

      await expect(second).rejects.toMatchObject({ name: INLINE_MEDIA_UPLOAD_REJECTION_NAME });
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

      await expect(result.current.uploadInlineMedia(imageFile())).rejects.toMatchObject({
        message: 'network down',
        name: INLINE_MEDIA_UPLOAD_REJECTION_NAME,
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'Could not upload image. Try again.' }),
      );
      expect(result.current.getPreviewUrl(fileUri('a'))).toBeNull();
    });

    it('toasts sign-in once and keeps the tagged rejection when the upload is UNAUTHORIZED (#2555)', async () => {
      vi.mocked(FileController.commitCreate).mockRejectedValue(
        Err.auth(AuthErrorCode.UNAUTHORIZED, 'Unauthorized', {
          service: ErrorService.Homeserver,
          operation: 'commitCreate',
        }),
      );
      const { result } = setup();

      await expect(result.current.uploadInlineMedia(imageFile())).rejects.toMatchObject({
        name: INLINE_MEDIA_UPLOAD_REJECTION_NAME,
      });

      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'Session expired. Please sign in.' }),
      );
      expect(result.current.uploadingCount).toBe(0);
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
        pending = result.current.uploadInlineMedia(imageFile());
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
    const uploadTwo = async (result: { current: ReturnType<typeof useInlineMediaUpload> }) => {
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(fileUri('a')).mockResolvedValueOnce(fileUri('b'));
      await act(async () => {
        await result.current.uploadInlineMedia(imageFile('a.png'));
        await result.current.uploadInlineMedia(imageFile('b.png'));
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
        pending = result.current.uploadInlineMedia(imageFile());
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

    it('keeps the uploads when article mode is disabled while a lock draft holds the session', async () => {
      const { result, rerender } = setup();
      await uploadTwo(result);

      await act(async () => {
        rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(result.current.getSessionFile(fileUri('a'))).toBeInstanceOf(File);
    });

    it('discards the session once the lock draft lets go of it outside article mode', async () => {
      const { result, rerender } = setup();
      await uploadTwo(result);
      rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });

      rerender({ enabled: false, keepSession: false, authorPubky: PUBKY, getInlineBudget: () => 9 });

      await waitFor(() => {
        expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('a'), fileUri('b')] });
      });
    });

    it('keeps the uploads when the lock draft goes back into the article composer', async () => {
      const { result, rerender } = setup();
      await uploadTwo(result);
      rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });

      await act(async () => {
        rerender({ enabled: true, keepSession: false, authorPubky: PUBKY, getInlineBudget: () => 9 });
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(result.current.getPreviewUrl(fileUri('a'))).toMatch(/^blob:mock-/);
    });

    it('still discards on unmount while a lock draft holds the session', async () => {
      const { result, rerender, unmount } = setup();
      await uploadTwo(result);
      rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });

      unmount();

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

  describe('getSessionFile', () => {
    it('returns the file as it was picked, and null for a URI from outside the session', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('a'));
      const { result } = setup();
      const picked = imageFile('a.png', 'image/png');

      await act(async () => {
        await result.current.uploadInlineMedia(picked);
      });

      expect(result.current.getSessionFile(fileUri('a'))).toBe(picked);
      expect(result.current.getSessionFile(fileUri('other'))).toBeNull();
    });
  });

  describe('buildLocalAttachmentEntries', () => {
    it('maps session URIs to object-URL entries and unknown URIs to null', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('a'));
      const { result } = setup();

      await act(async () => {
        await result.current.uploadInlineMedia(imageFile('a.png', 'image/png'));
      });

      const entries = result.current.buildLocalAttachmentEntries([fileUri('kept-old'), fileUri('a')]);

      expect(entries[0]).toBeNull();
      expect(entries[1]).toEqual({
        type: 'image/png',
        name: 'a.png',
        urls: { main: expect.stringMatching(/^blob:mock-/), feed: expect.stringMatching(/^blob:mock-/) },
      });
    });

    it('gives a non-image entry its main object URL only', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('v'));
      const { result } = setup();

      await act(async () => {
        await result.current.uploadInlineMedia(imageFile('clip.mp4', 'video/mp4'));
      });

      const [entry] = result.current.buildLocalAttachmentEntries([fileUri('v')]);

      expect(entry).toEqual({
        type: 'video/mp4',
        name: 'clip.mp4',
        urls: { main: expect.stringMatching(/^blob:mock-/), feed: undefined },
      });
    });
  });
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ waitForAuth: mockWaitForAuth }),
}));
