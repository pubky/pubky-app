import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
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

const mockCreateObjectURL = vi.fn(() => `blob:mock-${mockCreateObjectURL.mock.calls.length}`);
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const fileUri = (id: string) => `pubky://${PUBKY}/pub/pubky.app/files/${id}`;
// A staged URI: the author's file path with a `draft-` id of a real id's length (13 characters)
const STAGED_URI_PATTERN = new RegExp(`^pubky://${PUBKY}/pub/pubky\\.app/files/draft-[0-9a-f]{7}$`);

const imageFile = (name = 'pic.png', type = 'image/png', size = 1024) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const setup = (overrides?: Partial<Parameters<typeof useInlineMediaUpload>[0]>) =>
  renderHook((props: Parameters<typeof useInlineMediaUpload>[0]) => useInlineMediaUpload(props), {
    initialProps: { enabled: true, authorPubky: PUBKY, getInlineBudget: () => 9, ...overrides },
  });

type HookResult = { current: ReturnType<typeof useInlineMediaUpload> };

/** Stages a file and returns the URI the body references. */
const stage = async (result: HookResult, file = imageFile()) => {
  let uri = '';
  await act(async () => {
    uri = await result.current.stageInlineMedia(file);
  });
  return uri;
};

describe('useInlineMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('stageInlineMedia', () => {
    it('stages a valid image under a placeholder file URI without uploading it', async () => {
      const { result } = setup();

      const uri = await stage(result);

      expect(uri).toMatch(STAGED_URI_PATTERN);
      expect(FileController.commitCreate).not.toHaveBeenCalled();
      expect(result.current.getPreviewUrl(uri)).toMatch(/^blob:mock-/);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('gives every staged file its own URI', async () => {
      const { result } = setup();

      const first = await stage(result, imageFile('a.png'));
      const second = await stage(result, imageFile('b.png'));

      expect(first).not.toBe(second);
      expect(result.current.getMediaName(first)).toBe('a.png');
      expect(result.current.getMediaName(second)).toBe('b.png');
    });

    it('rejects a batch staged in the tick the session was discarded, without a toast', async () => {
      const { result } = setup();

      let pending!: Promise<string>;
      await act(async () => {
        pending = result.current.stageInlineMedia(imageFile('clip.mp4', 'video/mp4'));
        await result.current.discardSession();
        await expect(pending).rejects.toMatchObject({ name: INLINE_MEDIA_UPLOAD_REJECTION_NAME });
      });

      expect(vi.mocked(toast)).not.toHaveBeenCalled();
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it('rejects the batch, tagged and after one toast, when staging itself throws', async () => {
      const { result } = setup({
        getInlineBudget: () => {
          throw new Error('budget parser crashed');
        },
      });

      let batch!: Promise<string>[];
      act(() => {
        batch = [
          result.current.stageInlineMedia(imageFile('a.png')),
          result.current.stageInlineMedia(imageFile('b.png')),
        ];
      });

      for (const staged of batch) {
        await expect(staged).rejects.toMatchObject({ name: INLINE_MEDIA_UPLOAD_REJECTION_NAME });
      }
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'Could not add the file. Try again.' }),
      );
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it('rejects when disabled or unauthenticated', async () => {
      const disabled = setup({ enabled: false });
      await expect(disabled.result.current.stageInlineMedia(imageFile())).rejects.toThrow();

      const noAuthor = setup({ authorPubky: null });
      await expect(noAuthor.result.current.stageInlineMedia(imageFile())).rejects.toThrow();

      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it('rejects unsupported MIME types with a toast', async () => {
      const { result } = setup();

      await expect(result.current.stageInlineMedia(imageFile('a.zip', 'application/zip'))).rejects.toThrow();

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Unsupported file type') }),
      );
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it('rejects oversized images with a toast', async () => {
      const { result } = setup();

      await expect(
        result.current.stageInlineMedia(imageFile('big.png', 'image/png', 21 * 1024 * 1024)),
      ).rejects.toThrow();

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('exceeds') }),
      );
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it.each([
      ['video/mp4', 'clip.mp4'],
      ['video/mpeg', 'clip.mpeg'],
      ['audio/mpeg', 'song.mp3'],
      ['audio/wav', 'song.wav'],
      ['application/pdf', 'paper.pdf'],
    ])('stages %s like an image and records its type and name for the editor', async (type, name) => {
      const { result } = setup();

      const uri = await stage(result, imageFile(name, type));

      expect(uri).toMatch(STAGED_URI_PATTERN);
      expect(result.current.getMediaType(uri)).toBe(type);
      expect(result.current.getMediaType(fileUri('elsewhere'))).toBeNull();
      expect(result.current.getMediaName(uri)).toBe(name);
      expect(result.current.getMediaName(fileUri('elsewhere'))).toBeNull();
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('caps non-image media at the attachment limit, not the image limit', async () => {
      const { result } = setup();

      // 21 MB is over the image cap but well under the 100 MB file cap
      await stage(result, imageFile('clip.mp4', 'video/mp4', 21 * 1024 * 1024));
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);

      await expect(
        result.current.stageInlineMedia(imageFile('huge.mp4', 'video/mp4', 101 * 1024 * 1024)),
      ).rejects.toThrow();
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: 'File exceeds the 100MB limit.' }),
      );
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it('rejects when the inline budget is exhausted, tagged for the global handler', async () => {
      const { result } = setup({ getInlineBudget: () => 0 });

      await expect(result.current.stageInlineMedia(imageFile())).rejects.toMatchObject({
        name: INLINE_MEDIA_UPLOAD_REJECTION_NAME,
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Articles support up to') }),
      );
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it('rejects an over-budget batch wholesale without staging anything', async () => {
      const { result } = setup({ getInlineBudget: () => 2 });

      // Three files dropped together with two slots left: the editor inserts
      // all-or-nothing, so partial staging would be wasted — reject them all
      let batch!: Promise<string>[];
      act(() => {
        batch = [
          result.current.stageInlineMedia(imageFile('a.png')),
          result.current.stageInlineMedia(imageFile('b.png')),
          result.current.stageInlineMedia(imageFile('c.png')),
        ];
      });

      for (const staged of batch) {
        await expect(staged).rejects.toMatchObject({ name: INLINE_MEDIA_UPLOAD_REJECTION_NAME });
      }
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
      // One toast for the whole batch
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', description: expect.stringContaining('Articles support up to') }),
      );
    });

    it('stages a same-tick batch that fits the budget', async () => {
      const { result } = setup({ getInlineBudget: () => 2 });

      let batch!: Promise<string>[];
      act(() => {
        batch = [
          result.current.stageInlineMedia(imageFile('a.png')),
          result.current.stageInlineMedia(imageFile('b.png')),
        ];
      });

      let uris: string[] = [];
      await act(async () => {
        uris = await Promise.all(batch);
      });
      expect(uris).toHaveLength(2);
      expect(uris[0]).toMatch(STAGED_URI_PATTERN);
      expect(uris[1]).toMatch(STAGED_URI_PATTERN);
      expect(uris[0]).not.toBe(uris[1]);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });
  });

  describe('uploadStaged', () => {
    it('uploads the staged files among the URIs, in order, and maps each to its homeserver URI', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(fileUri('A')).mockResolvedValueOnce(fileUri('B'));
      const { result } = setup();
      const pickedA = imageFile('a.png');
      const pickedB = imageFile('b.mp4', 'video/mp4');
      const stagedA = await stage(result, pickedA);
      const stagedB = await stage(result, pickedB);

      let uploaded: string[] = [];
      await act(async () => {
        uploaded = await result.current.uploadStaged([stagedB, stagedA]);
      });

      expect(FileController.commitCreate).toHaveBeenNthCalledWith(1, { file: pickedB, pubky: PUBKY });
      expect(FileController.commitCreate).toHaveBeenNthCalledWith(2, { file: pickedA, pubky: PUBKY });
      expect(uploaded).toEqual([fileUri('A'), fileUri('B')]);
    });

    it('maps a URI from outside the session to itself without uploading', async () => {
      const { result } = setup();

      let uploaded: string[] = [];
      await act(async () => {
        uploaded = await result.current.uploadStaged([fileUri('kept-original')]);
      });

      expect(uploaded).toEqual([fileUri('kept-original')]);
      expect(FileController.commitCreate).not.toHaveBeenCalled();
    });

    it('does not upload a file twice: a retry maps it to the URI it already has', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('A'));
      const { result } = setup();
      const staged = await stage(result);

      await act(async () => {
        await result.current.uploadStaged([staged]);
      });
      let uploaded: string[] = [];
      await act(async () => {
        uploaded = await result.current.uploadStaged([staged, fileUri('A')]);
      });

      expect(FileController.commitCreate).toHaveBeenCalledTimes(1);
      expect(uploaded).toEqual([fileUri('A'), fileUri('A')]);
    });

    it('rethrows the first failure as-is and keeps the uploads made before it', async () => {
      const failure = new Error('storage full');
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(fileUri('A')).mockRejectedValueOnce(failure);
      const { result } = setup();
      const stagedA = await stage(result, imageFile('a.png'));
      const stagedB = await stage(result, imageFile('b.png'));

      await act(async () => {
        await expect(result.current.uploadStaged([stagedA, stagedB])).rejects.toBe(failure);
      });

      // A retry uploads only the file that failed
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(fileUri('B'));
      let uploaded: string[] = [];
      await act(async () => {
        uploaded = await result.current.uploadStaged([stagedA, stagedB]);
      });
      expect(FileController.commitCreate).toHaveBeenCalledTimes(3);
      expect(uploaded).toEqual([fileUri('A'), fileUri('B')]);
    });

    it('resolves an uploaded file by its staged URI and by its homeserver URI alike', async () => {
      vi.mocked(FileController.commitCreate).mockResolvedValue(fileUri('A'));
      const { result } = setup();
      const picked = imageFile('a.png');
      const staged = await stage(result, picked);
      await act(async () => {
        await result.current.uploadStaged([staged]);
      });

      for (const uri of [staged, fileUri('A')]) {
        expect(result.current.getPreviewUrl(uri)).toMatch(/^blob:mock-/);
        expect(result.current.getSessionFile(uri)).toBe(picked);
        expect(result.current.getMediaType(uri)).toBe('image/png');
        expect(result.current.buildLocalAttachmentEntries([uri])[0]).toEqual(
          expect.objectContaining({ name: 'a.png', urls: expect.objectContaining({ main: expect.any(String) }) }),
        );
      }
    });
  });

  describe('session lifecycle', () => {
    const stageTwo = async (result: HookResult) => {
      const a = await stage(result, imageFile('a.png'));
      const b = await stage(result, imageFile('b.png'));
      return { a, b };
    };

    const uploadOne = async (result: HookResult, staged: string, uri: string) => {
      vi.mocked(FileController.commitCreate).mockResolvedValueOnce(uri);
      await act(async () => {
        await result.current.uploadStaged([staged]);
      });
    };

    it('finalizeSession revokes the unreferenced previews, keeps the referenced ones and deletes nothing staged', async () => {
      const { result } = setup();
      const { a, b } = await stageTwo(result);

      await act(async () => {
        await result.current.finalizeSession([a]);
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      // The referenced file keeps its object URL (ownership moves to the localFiles store); the other is revoked
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
      expect(result.current.getPreviewUrl(a)).toBeNull();
      expect(result.current.getPreviewUrl(b)).toBeNull();
    });

    it('finalizeSession deletes an uploaded file the body no longer references', async () => {
      const { result } = setup();
      const { a, b } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));
      await uploadOne(result, b, fileUri('B'));

      // The edit saved `a` under its homeserver URI; `b` was removed from the body after its upload
      await act(async () => {
        await result.current.finalizeSession([fileUri('A')]);
      });

      expect(FileController.commitDelete).toHaveBeenCalledTimes(1);
      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('B')] });
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('finalizeSession with everything referenced deletes nothing', async () => {
      const { result } = setup();
      const { a, b } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));

      await act(async () => {
        await result.current.finalizeSession([a, b]);
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });

    it('discardSession revokes every preview and deletes only the uploaded files', async () => {
      const { result } = setup();
      const { a } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));

      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('A')] });
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('discardSession with only staged files deletes nothing', async () => {
      const { result } = setup();
      await stageTwo(result);

      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('cleanup failures are swallowed', async () => {
      vi.mocked(FileController.commitDelete).mockRejectedValue(new Error('offline'));
      const { result } = setup();
      const { a } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));

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

    it('defers a discard requested while a commit is in flight until the commit settles', async () => {
      const { result } = setup();
      const { a } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));

      act(() => {
        result.current.setCommitting(true);
      });
      await act(async () => {
        await result.current.discardSession();
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();

      // The commit failed: what it left behind is released now
      act(() => {
        result.current.setCommitting(false);
      });

      await waitFor(() => {
        expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('A')] });
      });
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('a deferred discard finds nothing after the commit finalized the session', async () => {
      const { result } = setup();
      const { a, b } = await stageTwo(result);

      act(() => {
        result.current.setCommitting(true);
      });
      await act(async () => {
        await result.current.discardSession();
        await result.current.finalizeSession([a, b]);
      });
      act(() => {
        result.current.setCommitting(false);
      });

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });

    it('discards the session on unmount', async () => {
      const { result, unmount } = setup();
      const { a } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));

      unmount();

      await waitFor(() => {
        expect(FileController.commitDelete).toHaveBeenCalledWith({ fileUris: [fileUri('A')] });
      });
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('discards the session when article mode is disabled', async () => {
      const { result, rerender } = setup();
      await stageTwo(result);

      rerender({ enabled: false, authorPubky: PUBKY, getInlineBudget: () => 9 });

      await waitFor(() => {
        expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
      });
      expect(FileController.commitDelete).not.toHaveBeenCalled();
    });

    it('keeps the files when article mode is disabled while a lock draft holds the session', async () => {
      const { result, rerender } = setup();
      const { a } = await stageTwo(result);

      await act(async () => {
        rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });
      });

      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
      expect(result.current.getSessionFile(a)).toBeInstanceOf(File);
    });

    it('releases the session once the lock draft lets go of it outside article mode', async () => {
      const { result, rerender } = setup();
      await stageTwo(result);
      rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });

      rerender({ enabled: false, keepSession: false, authorPubky: PUBKY, getInlineBudget: () => 9 });

      await waitFor(() => {
        expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
      });
      // Nothing was ever uploaded for the lock draft, so there is nothing to delete
      expect(FileController.commitDelete).not.toHaveBeenCalled();
    });

    it('keeps the files when the lock draft goes back into the article composer', async () => {
      const { result, rerender } = setup();
      const { a } = await stageTwo(result);
      rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });

      await act(async () => {
        rerender({ enabled: true, keepSession: false, authorPubky: PUBKY, getInlineBudget: () => 9 });
      });

      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
      expect(result.current.getPreviewUrl(a)).toMatch(/^blob:mock-/);
    });

    it('still discards on unmount while a lock draft holds the session', async () => {
      const { result, rerender, unmount } = setup();
      await stageTwo(result);
      rerender({ enabled: false, keepSession: true, authorPubky: PUBKY, getInlineBudget: () => 9 });

      unmount();

      await waitFor(() => {
        expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
      });
    });

    it('unmount after finalize is a no-op', async () => {
      const { result, unmount } = setup();
      const { a, b } = await stageTwo(result);
      await uploadOne(result, a, fileUri('A'));

      await act(async () => {
        await result.current.finalizeSession([a, b]);
      });
      unmount();

      expect(FileController.commitDelete).not.toHaveBeenCalled();
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('getSessionFile', () => {
    it('returns the file as it was picked, and null for a URI from outside the session', async () => {
      const { result } = setup();
      const picked = imageFile('a.png', 'image/png');

      const uri = await stage(result, picked);

      expect(result.current.getSessionFile(uri)).toBe(picked);
      expect(result.current.getSessionFile(fileUri('other'))).toBeNull();
    });
  });

  describe('buildLocalAttachmentEntries', () => {
    it('maps session URIs to object-URL entries and unknown URIs to null', async () => {
      const { result } = setup();

      const uri = await stage(result, imageFile('a.png', 'image/png'));

      const entries = result.current.buildLocalAttachmentEntries([fileUri('kept-old'), uri]);

      expect(entries[0]).toBeNull();
      expect(entries[1]).toEqual({
        type: 'image/png',
        name: 'a.png',
        urls: { main: expect.stringMatching(/^blob:mock-/), feed: expect.stringMatching(/^blob:mock-/) },
      });
    });

    it('gives a non-image entry its main object URL only', async () => {
      const { result } = setup();

      const uri = await stage(result, imageFile('clip.mp4', 'video/mp4'));

      const [entry] = result.current.buildLocalAttachmentEntries([uri]);

      expect(entry).toEqual({
        type: 'video/mp4',
        name: 'clip.mp4',
        urls: { main: expect.stringMatching(/^blob:mock-/), feed: undefined },
      });
    });
  });
});
