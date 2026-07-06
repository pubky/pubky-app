'use client';

import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';

type CoverImagePickerError = 'invalid-type' | 'too-large';

type UseCoverImagePickerParams = {
  /** Maximum allowed file size in bytes. Defaults to `IMAGE_MAX_RAW_SIZE`. */
  maxSize?: number;
  /**
   * Existing cover image URL (e.g. a `pubky://` URL on edit). When set, it is
   * surfaced as `previewUrl` until the user picks a new file or removes it.
   */
  initialPreviewUrl?: string | null;
};

export type UseCoverImagePickerResult = {
  /** Newly picked file. `null` when the user has not picked a file in this session. */
  file: File | null;
  /** URL to render in the UI: blob URL for a new file, or `initialPreviewUrl` until cleared. */
  previewUrl: string | null;
  /** `true` when the user explicitly removed an `initialPreviewUrl` without picking a new file. */
  isCleared: boolean;
  /** Validation error from the last `onInputChange`. Codes are translated by the consumer. */
  error: CoverImagePickerError | null;
  /** Ref to the hidden `<input type="file">` element managed by the consumer. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Wire to `<input type="file" onChange={...}>`. */
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Open the native file picker by clicking the hidden input. */
  choose: () => void;
  /** Clear the current preview/file (also clears any initial preview). */
  remove: () => void;
  /** Reset to the initial state (re-shows `initialPreviewUrl`). */
  reset: () => void;
};

/**
 * Manages the lifecycle of a cover image picker — file state, blob preview,
 * validation, and cleanup of object URLs. Designed for create/edit flows where
 * the cover image is uploaded separately and only the resulting URL is stored
 * in the collection (or post) envelope.
 *
 * @example
 * ```tsx
 * const cover = useCoverImagePicker();
 * <button onClick={cover.choose}>{cover.previewUrl ? 'Change' : 'Add image'}</button>
 * <input type="file" accept="image/*" ref={cover.inputRef} onChange={cover.onInputChange} hidden />
 * ```
 */
export function useCoverImagePicker({
  maxSize = IMAGE_MAX_RAW_SIZE,
  initialPreviewUrl = null,
}: UseCoverImagePickerParams = {}): UseCoverImagePickerResult {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isInitialCleared, setIsInitialCleared] = useState(false);
  const [error, setError] = useState<CoverImagePickerError | null>(null);

  // Revoke any blob URL we created when it changes or on unmount. We only
  // create blob URLs in `onInputChange`, so a single guarded revoke covers
  // the lifecycle without leaking on identity-only re-renders.
  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const clearLocalPreview = () => {
    setLocalPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearNativeInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const choose = () => {
    inputRef.current?.click();
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) return;

    if (!next.type.startsWith('image/')) {
      setError('invalid-type');
      return;
    }

    if (next.size > maxSize) {
      setError('too-large');
      return;
    }

    setLocalPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
    setFile(next);
    setIsInitialCleared(false);
    setError(null);
  };

  const remove = () => {
    setFile(null);
    clearLocalPreview();
    setIsInitialCleared(true);
    setError(null);
    clearNativeInput();
  };

  const reset = () => {
    setFile(null);
    clearLocalPreview();
    setIsInitialCleared(false);
    setError(null);
    clearNativeInput();
  };

  const previewUrl = localPreviewUrl ?? (isInitialCleared ? null : (initialPreviewUrl ?? null));

  return {
    file,
    previewUrl,
    isCleared: isInitialCleared && !file,
    error,
    inputRef,
    onInputChange,
    choose,
    remove,
    reset,
  };
}
