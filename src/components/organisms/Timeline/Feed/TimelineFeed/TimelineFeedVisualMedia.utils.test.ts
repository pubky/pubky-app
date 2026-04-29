import { describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { probeImageDimensions, probeVideoDimensions } from './TimelineFeedVisualMedia.utils';

describe('TimelineFeedVisualMedia.utils', () => {
  it('cleans up image probe resources after the metadata resolves', async () => {
    const createdImages: Array<{
      onload: (() => void) | null;
      onerror: (() => void) | null;
      naturalWidth: number;
      naturalHeight: number;
      src: string;
    }> = [];

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 720;
      naturalHeight = 405;
      private currentSrc = '';

      constructor() {
        createdImages.push(this);
      }

      set src(value: string) {
        this.currentSrc = value;

        if (!value) {
          this.naturalWidth = 0;
          this.naturalHeight = 0;
          return;
        }

        this.naturalWidth = 720;
        this.naturalHeight = 405;
        queueMicrotask(() => {
          this.onload?.();
        });
      }

      get src() {
        return this.currentSrc;
      }
    }

    const originalImage = window.Image;
    Object.defineProperty(window, 'Image', {
      writable: true,
      configurable: true,
      value: MockImage,
    });

    try {
      await expect(probeImageDimensions('/probe-image.jpg')).resolves.toEqual({
        width: 720,
        height: 405,
      });
    } finally {
      Object.defineProperty(window, 'Image', {
        writable: true,
        configurable: true,
        value: originalImage,
      });
    }

    expect(createdImages).toHaveLength(1);
    expect(createdImages[0]?.onload).toBeNull();
    expect(createdImages[0]?.onerror).toBeNull();
    expect(createdImages[0]?.src).toBe('');
  });

  it('cleans up video probe resources after the metadata resolves', async () => {
    const createdVideos: Array<{
      onloadedmetadata: (() => void) | null;
      onerror: (() => void) | null;
      preload: string;
      muted: boolean;
      playsInline: boolean;
      videoWidth: number;
      videoHeight: number;
      src: string;
      load: ReturnType<typeof vi.fn>;
    }> = [];

    class MockVideoElement {
      onloadedmetadata: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = '';
      muted = false;
      playsInline = false;
      videoWidth = 1280;
      videoHeight = 720;
      load = vi.fn();
      private currentSrc = '';

      constructor() {
        createdVideos.push(this);
      }

      set src(value: string) {
        this.currentSrc = value;

        if (!value) {
          this.videoWidth = 0;
          this.videoHeight = 0;
          return;
        }

        this.videoWidth = 1280;
        this.videoHeight = 720;
        queueMicrotask(() => {
          this.onloadedmetadata?.();
        });
      }

      get src() {
        return this.currentSrc;
      }
    }

    const originalCreateElement = document.createElement.bind(document) as (tagName: string) => HTMLElement;
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        return asOpaque<HTMLVideoElement>(new MockVideoElement());
      }

      return originalCreateElement(tagName);
    });

    try {
      await expect(probeVideoDimensions('/probe-video.mp4')).resolves.toEqual({
        width: 1280,
        height: 720,
      });
    } finally {
      createElementSpy.mockRestore();
    }

    expect(createdVideos).toHaveLength(1);
    expect(createdVideos[0]?.onloadedmetadata).toBeNull();
    expect(createdVideos[0]?.onerror).toBeNull();
    expect(createdVideos[0]?.src).toBe('');
    expect(createdVideos[0]?.load).toHaveBeenCalledTimes(1);
  });
});
