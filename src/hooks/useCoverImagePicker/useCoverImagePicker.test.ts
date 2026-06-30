import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asInvalid } from '@/test-utils/type-assertions';
import { useCoverImagePicker } from './useCoverImagePicker';

const stubbedUrl = vi.hoisted(() => ({
  createObjectURL: vi.fn<(file: File) => string>(() => 'blob:cover-mock'),
  revokeObjectURL: vi.fn(),
}));

const buildChangeEvent = (file: File | null): ChangeEvent<HTMLInputElement> =>
  asInvalid<ChangeEvent<HTMLInputElement>>({
    target: { files: file ? [file] : [], value: '' },
  });

describe('useCoverImagePicker', () => {
  beforeEach(() => {
    stubbedUrl.createObjectURL.mockClear();
    stubbedUrl.revokeObjectURL.mockClear();
    vi.stubGlobal('URL', { ...URL, ...stubbedUrl });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty and exposes an initial preview URL when provided', () => {
    const { result } = renderHook(() => useCoverImagePicker({ initialPreviewUrl: 'https://cdn/x.png' }));

    expect(result.current.file).toBeNull();
    expect(result.current.previewUrl).toBe('https://cdn/x.png');
    expect(result.current.isCleared).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('accepts an image file and exposes a blob preview URL', () => {
    const { result } = renderHook(() => useCoverImagePicker());

    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    act(() => {
      result.current.onInputChange(buildChangeEvent(file));
    });

    expect(stubbedUrl.createObjectURL).toHaveBeenCalledWith(file);
    expect(result.current.file).toBe(file);
    expect(result.current.previewUrl).toBe('blob:cover-mock');
    expect(result.current.error).toBeNull();
  });

  it('rejects non-image files with an `invalid-type` error and keeps state', () => {
    const { result } = renderHook(() => useCoverImagePicker());

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    act(() => {
      result.current.onInputChange(buildChangeEvent(file));
    });

    expect(result.current.error).toBe('invalid-type');
    expect(result.current.file).toBeNull();
    expect(result.current.previewUrl).toBeNull();
  });

  it('rejects oversize files with a `too-large` error', () => {
    const { result } = renderHook(() => useCoverImagePicker({ maxSize: 4 }));

    const file = new File(['12345678'], 'big.png', { type: 'image/png' });
    act(() => {
      result.current.onInputChange(buildChangeEvent(file));
    });

    expect(result.current.error).toBe('too-large');
    expect(result.current.file).toBeNull();
  });

  it('marks the picker cleared when removing an initial preview', () => {
    const { result } = renderHook(() => useCoverImagePicker({ initialPreviewUrl: 'https://cdn/x.png' }));

    act(() => {
      result.current.remove();
    });

    expect(result.current.previewUrl).toBeNull();
    expect(result.current.isCleared).toBe(true);
  });

  it('reset() restores the initial preview and clears the file state', () => {
    const { result } = renderHook(() => useCoverImagePicker({ initialPreviewUrl: 'https://cdn/x.png' }));

    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    act(() => {
      result.current.onInputChange(buildChangeEvent(file));
    });
    expect(result.current.previewUrl).toBe('blob:cover-mock');

    act(() => {
      result.current.reset();
    });

    expect(result.current.file).toBeNull();
    expect(result.current.previewUrl).toBe('https://cdn/x.png');
    expect(result.current.isCleared).toBe(false);
    expect(stubbedUrl.revokeObjectURL).toHaveBeenCalled();
  });

  it('revokes the blob URL when the previewing file changes', () => {
    const { result } = renderHook(() => useCoverImagePicker());

    const first = new File(['1'], 'first.png', { type: 'image/png' });
    const second = new File(['2'], 'second.png', { type: 'image/png' });

    act(() => {
      result.current.onInputChange(buildChangeEvent(first));
    });
    act(() => {
      result.current.onInputChange(buildChangeEvent(second));
    });

    expect(stubbedUrl.createObjectURL).toHaveBeenCalledTimes(2);
    expect(stubbedUrl.revokeObjectURL).toHaveBeenCalled();
  });
});
