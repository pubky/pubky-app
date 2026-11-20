import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePubkyAppFile } from './usePubkyAppFile';

const mocks = vi.hoisted(() => ({ files: vi.fn() }));
vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', () => ({ useAttachmentsMetadata: mocks.files }));

const URI = 'pubky://apuij4kxbsj1wnh4douy7jptoscrttnkoz9zfo6k8dge1mfyadso/pub/pubky.app/files/00360YV6W3NZG';

describe('usePubkyAppFile', () => {
  beforeEach(() => mocks.files.mockReset());

  it('reads the one file as a post’s attachment, its row whatever spelling it was answered under', () => {
    mocks.files.mockReturnValue({ files: [{ uri: URI.toUpperCase(), name: 'note-1.txt' }], isLoading: false });
    const { result } = renderHook(() => usePubkyAppFile(URI));

    expect(mocks.files).toHaveBeenCalledWith({ fileUris: [URI] });
    expect(result.current).toEqual({ file: { uri: URI.toUpperCase(), name: 'note-1.txt' }, isLoading: false });
  });

  it('gives no file while it is read, and none once the read settled without it', () => {
    mocks.files.mockReturnValue({ files: [], isLoading: true });
    const { result, rerender } = renderHook(() => usePubkyAppFile(URI));
    expect(result.current).toEqual({ file: null, isLoading: true });

    mocks.files.mockReturnValue({ files: [], isLoading: false });
    rerender();
    expect(result.current).toEqual({ file: null, isLoading: false });
  });
});
