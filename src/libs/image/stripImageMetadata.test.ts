import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_COMPRESSION_QUALITY_STEPS,
  IMAGE_ENCODE_QUALITY,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_RAW_SIZE,
  IMAGE_MAX_UPLOAD_SIZE,
} from '@/config/images';
import { asOpaque } from '@/test-utils/type-assertions';
import { stripImageMetadata } from './stripImageMetadata';

describe('stripImageMetadata', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockContext: CanvasRenderingContext2D;
  let mockImage: HTMLImageElement;
  let originalImageConstructor: typeof Image;
  let originalCreateImageBitmap: typeof createImageBitmap | undefined;

  beforeEach(() => {
    originalImageConstructor = global.Image;
    originalCreateImageBitmap = globalThis.createImageBitmap;

    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    mockContext = asOpaque<CanvasRenderingContext2D>({
      drawImage: vi.fn(),
    });

    mockCanvas = asOpaque<HTMLCanvasElement>({
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockContext),
      toBlob: vi.fn((callback, mimeType) => {
        callback(new Blob(['sanitized'], { type: mimeType as string }));
      }),
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas;
      }
      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    });

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:input-image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    mockImage = asOpaque<HTMLImageElement>({
      naturalWidth: 120,
      naturalHeight: 80,
      width: 120,
      height: 80,
      src: '',
      addEventListener: vi.fn((event, handler) => {
        if (event === 'load') {
          setTimeout(() => handler(new Event('load')), 0);
        }
      }),
    });

    // @ts-expect-error - mocking global Image for controlled image loading in tests
    global.Image = class {
      addEventListener = mockImage.addEventListener;
      naturalWidth = mockImage.naturalWidth;
      naturalHeight = mockImage.naturalHeight;
      width = mockImage.width;
      height = mockImage.height;
      src = mockImage.src;

      constructor() {
        return mockImage;
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.Image = originalImageConstructor;
    if (originalCreateImageBitmap) {
      Object.defineProperty(globalThis, 'createImageBitmap', {
        configurable: true,
        value: originalCreateImageBitmap,
        writable: true,
      });
    } else {
      delete (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap;
    }
  });

  function buildSizedBlob(size: number, mimeType: string): Blob {
    return new Blob([new Uint8Array(size)], { type: mimeType });
  }

  function mockToBlobSizes(sizes: number[]): void {
    let callIndex = 0;
    (mockCanvas.toBlob as ReturnType<typeof vi.fn>).mockImplementation((callback, mimeType) => {
      const size = sizes[Math.min(callIndex, sizes.length - 1)];
      callIndex += 1;
      callback(buildSizedBlob(size, mimeType as string));
    });
  }

  function setMockImageDimensions(width: number, height: number): void {
    Object.assign(mockImage, {
      naturalWidth: width,
      naturalHeight: height,
      width,
      height,
    });
  }

  function asciiBytes(value: string): number[] {
    return Array.from(value, (character) => character.charCodeAt(0));
  }

  function uint32LittleEndianBytes(value: number): number[] {
    return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
  }

  function uint16BigEndianBytes(value: number): number[] {
    return [(value >> 8) & 0xff, value & 0xff];
  }

  function buildJpegBytes(width: number, height: number): ArrayBuffer {
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      ...asciiBytes('JFIF\0'),
      0x01,
      0x01,
      0x00,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00,
      0x00,
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      ...uint16BigEndianBytes(height),
      ...uint16BigEndianBytes(width),
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x00,
      0x03,
      0x11,
      0x00,
    ]);
    return bytes.buffer as ArrayBuffer;
  }

  const WEBP_ANIM_FLAG = 0x02;
  const WEBP_XMP_FLAG = 0x04;
  const WEBP_EXIF_FLAG = 0x08;

  function containsFourCc(bytes: Uint8Array, fourCc: string): boolean {
    const target = asciiBytes(fourCc);
    for (let i = 0; i + target.length <= bytes.length; i += 1) {
      if (target.every((byte, j) => bytes[i + j] === byte)) {
        return true;
      }
    }
    return false;
  }

  function buildWebpBytes(chunks: { type: string; payload: Uint8Array }[]): ArrayBuffer {
    const chunkBytes = chunks.flatMap(({ type, payload }) => [
      ...asciiBytes(type),
      ...uint32LittleEndianBytes(payload.length),
      ...Array.from(payload),
      ...(payload.length % 2 === 1 ? [0] : []),
    ]);

    const bytes = new Uint8Array([
      ...asciiBytes('RIFF'),
      ...uint32LittleEndianBytes(4 + chunkBytes.length),
      ...asciiBytes('WEBP'),
      ...chunkBytes,
    ]);
    return bytes.buffer as ArrayBuffer;
  }

  it('sanitizes supported image types and returns a new file', async () => {
    const inputFile = new File(['raw-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const arrayBufferSpy = vi.spyOn(inputFile, 'arrayBuffer');

    const result = await stripImageMetadata(inputFile);

    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).not.toBe(inputFile.name);
    expect(result.name).toMatch(/^[a-z0-9]+\.jpg$/);
    expect(mockCanvas.width).toBe(120);
    expect(mockCanvas.height).toBe(80);
    expect(mockContext.drawImage).toHaveBeenCalledWith(mockImage, 0, 0, 120, 80);
    expect(mockCanvas.toBlob).toHaveBeenCalled();
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('image/jpeg');
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe(IMAGE_ENCODE_QUALITY);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(inputFile);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:input-image');
  });

  it('downscales oversized raster images preserving aspect ratio', async () => {
    setMockImageDimensions(4096, 2048);
    const inputFile = new File(['raw-image-bytes'], 'large-photo.jpg', { type: 'image/jpeg' });

    await stripImageMetadata(inputFile);

    expect(mockCanvas.width).toBe(IMAGE_MAX_DIMENSION);
    expect(mockCanvas.height).toBe(1024);
    expect(mockContext.drawImage).toHaveBeenCalledWith(mockImage, 0, 0, IMAGE_MAX_DIMENSION, 1024);
    expect(mockContext.imageSmoothingQuality).toBe('high');
  });

  it('uses resized createImageBitmap for high-resolution photos instead of rejecting source pixels', async () => {
    const bitmapClose = vi.fn();
    const bitmap = asOpaque<ImageBitmap>({
      close: bitmapClose,
      height: 1536,
      width: IMAGE_MAX_DIMENSION,
    });
    const createImageBitmapMock = vi.fn().mockResolvedValue(bitmap);
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: createImageBitmapMock,
      writable: true,
    });
    const inputFile = new File([buildJpegBytes(8160, 6120)], 'pixel-high-res.jpg', { type: 'image/jpeg' });
    Object.defineProperty(inputFile, 'size', { value: IMAGE_MAX_RAW_SIZE - 1 });

    const result = await stripImageMetadata(inputFile);

    expect(result.type).toBe('image/jpeg');
    expect(createImageBitmapMock).toHaveBeenCalledWith(inputFile, {
      imageOrientation: 'from-image',
      resizeWidth: IMAGE_MAX_DIMENSION,
      resizeHeight: 1536,
      resizeQuality: 'high',
    });
    expect(mockCanvas.width).toBe(IMAGE_MAX_DIMENSION);
    expect(mockCanvas.height).toBe(1536);
    expect(mockContext.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, IMAGE_MAX_DIMENSION, 1536);
    expect(bitmapClose).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects image files exceeding the raw image cap before decoding', async () => {
    const inputFile = new File(['raw-image-bytes'], 'huge-photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(inputFile, 'size', { value: IMAGE_MAX_RAW_SIZE + 1 });

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('IMAGE_UPLOAD_SIZE_LIMIT:raw');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('detects PNG files from magic bytes when file.type is empty', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);
    const inputFile = new File([pngBytes], 'upload', { type: '' });

    const result = await stripImageMetadata(inputFile);

    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/png');
    expect(result.name).toMatch(/^[a-z0-9]+\.png$/);
    expect(URL.createObjectURL).toHaveBeenCalledWith(inputFile);
    expect(mockCanvas.toBlob).toHaveBeenCalled();
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]).toBe('image/png');
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2]).toBeUndefined();
  });

  it('falls back to file extension when file.type is empty', async () => {
    const inputFile = new File(['raw-image-bytes'], 'photo.jpeg', { type: '' });

    const result = await stripImageMetadata(inputFile);

    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toMatch(/^[a-z0-9]+\.jpg$/);
    expect(URL.createObjectURL).toHaveBeenCalledWith(inputFile);
    expect(mockCanvas.toBlob).toHaveBeenCalled();
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]).toBe('image/jpeg');
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2]).toBe(IMAGE_ENCODE_QUALITY);
  });

  it('leaves non-image files unchanged', async () => {
    const inputFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });

    const result = await stripImageMetadata(inputFile);

    expect(result).toBe(inputFile);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('keeps GIF uploads out of the canvas path while obfuscating filename', async () => {
    const inputFile = new File(['original-content'], 'animated.gif', { type: 'image/gif' });

    const result = await stripImageMetadata(inputFile);

    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/gif');
    expect(result.name).not.toBe(inputFile.name);
    expect(result.name).toMatch(/^[a-z0-9]+\.gif$/);
    expect(await result.text()).toBe('original-content');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('keeps animated WebP out of the canvas path to preserve all frames', async () => {
    const animatedWebp = buildWebpBytes([
      { type: 'XMP ', payload: new Uint8Array(600) },
      { type: 'ANIM', payload: new Uint8Array([0, 0, 0, 0, 0, 0]) },
    ]);
    const inputFile = new File([animatedWebp], 'loop.webp', { type: 'image/webp' });

    const result = await stripImageMetadata(inputFile);

    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/webp');
    expect(result.name).toMatch(/^[a-z0-9]+\.webp$/);
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('strips EXIF/XMP chunks from animated WebP while preserving animation frames', async () => {
    const animatedWebp = buildWebpBytes([
      {
        type: 'VP8X',
        payload: new Uint8Array([WEBP_EXIF_FLAG | WEBP_XMP_FLAG | WEBP_ANIM_FLAG, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      },
      { type: 'ANIM', payload: new Uint8Array([0, 0, 0, 0, 0, 0]) },
      { type: 'EXIF', payload: new Uint8Array(120) },
      { type: 'XMP ', payload: new Uint8Array(600) },
    ]);
    const inputFile = new File([animatedWebp], 'loop.webp', { type: 'image/webp' });

    const result = await stripImageMetadata(inputFile);
    const bytes = new Uint8Array(await result.arrayBuffer());

    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
    expect(containsFourCc(bytes, 'EXIF')).toBe(false);
    expect(containsFourCc(bytes, 'XMP ')).toBe(false);
    expect(containsFourCc(bytes, 'ANIM')).toBe(true);
    // VP8X flags byte (offset 12 + 8) should have EXIF/XMP bits cleared, ANIM kept.
    expect(bytes[20] & (WEBP_EXIF_FLAG | WEBP_XMP_FLAG)).toBe(0);
    expect(bytes[20] & WEBP_ANIM_FLAG).toBe(WEBP_ANIM_FLAG);
    // RIFF size field stays consistent with the rebuilt container.
    const riffSize = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    expect(riffSize).toBe(bytes.length - 8);
  });

  it('sanitizes static WebP when ANIM appears only inside chunk data', async () => {
    const staticWebp = buildWebpBytes([{ type: 'EXIF', payload: new Uint8Array(asciiBytes('ANIM')) }]);
    const inputFile = new File([staticWebp], 'still.webp', { type: 'image/webp' });

    const result = await stripImageMetadata(inputFile);

    expect(result.type).toBe('image/webp');
    expect(result.name).toMatch(/^[a-z0-9]+\.webp$/);
    expect(mockCanvas.toBlob).toHaveBeenCalled();
  });

  it('keeps safe SVG uploads while obfuscating filename', async () => {
    const inputFile = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="4"/></svg>'],
      'icon.svg',
      {
        type: 'image/svg+xml',
      },
    );

    const result = await stripImageMetadata(inputFile);

    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/svg+xml');
    expect(result.name).not.toBe(inputFile.name);
    expect(result.name).toMatch(/^[a-z0-9]+\.svg$/);
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('rejects SVG files over the upload limit after sanitization', async () => {
    const padding = 'x'.repeat(IMAGE_MAX_UPLOAD_SIZE + 1);
    const inputFile = new File(
      [`<svg xmlns="http://www.w3.org/2000/svg"><!--${padding}--><circle cx="8" cy="8" r="4"/></svg>`],
      'large-icon.svg',
      { type: 'image/svg+xml' },
    );

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('IMAGE_UPLOAD_SIZE_LIMIT:svg');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('sanitizes SVG files declared via file.type', async () => {
    const inputFile = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><circle cx="8" cy="8" r="4"/></svg>',
      ],
      'icon.svg',
      { type: 'image/svg+xml' },
    );

    const result = await stripImageMetadata(inputFile);
    const text = await result.text();

    expect(result.type).toBe('image/svg+xml');
    expect(result.name).toMatch(/^[a-z0-9]+\.svg$/);
    expect(text).toContain('<circle');
    expect(text).not.toContain('<script');
    expect(text).not.toContain('onload');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('sanitizes SVG files declared via file extension', async () => {
    const inputFile = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'],
      'icon.svg',
      {
        type: '',
      },
    );

    const result = await stripImageMetadata(inputFile);

    expect(result.type).toBe('image/svg+xml');
    expect(result.name).toMatch(/^[a-z0-9]+\.svg$/);
    expect(await result.text()).toContain('<rect');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('sanitizes SVG files detected from magic bytes', async () => {
    const svgBytes = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="https://example.com"></iframe></foreignObject><circle cx="8" cy="8" r="4"/></svg>',
    );
    const inputFile = new File([svgBytes], 'upload', { type: '' });

    const result = await stripImageMetadata(inputFile);
    const text = await result.text();

    expect(result).not.toBe(inputFile);
    expect(result.type).toBe('image/svg+xml');
    expect(result.name).toMatch(/^[a-z0-9]+\.svg$/);
    expect(text).toContain('<circle');
    expect(text).not.toContain('foreignObject');
    expect(text).not.toContain('iframe');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('removes risky SVG references and keeps local references', async () => {
    const inputFile = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="p" d="M0 0"/></defs><use href="#p"/><image href="https://example.com/a.png"/><a href="javascript:alert(1)"><text>bad</text></a><rect fill="url(http://example.com/pattern)"/></svg>',
      ],
      'icon.svg',
      { type: 'image/svg+xml' },
    );

    const result = await stripImageMetadata(inputFile);
    const text = await result.text();

    expect(text).toContain('href="#p"');
    expect(text).not.toContain('https://example.com');
    expect(text).not.toContain('javascript:');
    expect(text).not.toContain('url(http://example.com/pattern)');
  });

  it('throws when sanitization fails for supported formats', async () => {
    (mockCanvas.toBlob as ReturnType<typeof vi.fn>).mockImplementation((callback) => callback(null));

    const inputFile = new File(['raw-image-bytes'], 'broken.webp', { type: 'image/webp' });

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('Failed to encode sanitized image');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:input-image');
  });

  it('progressively downscales PNG when the first encode still exceeds the upload limit', async () => {
    setMockImageDimensions(1920, 1920);
    mockToBlobSizes([IMAGE_MAX_UPLOAD_SIZE + 1, IMAGE_MAX_UPLOAD_SIZE - 1]);
    const inputFile = new File(['raw-image-bytes'], 'large-photo.png', { type: 'image/png' });

    const result = await stripImageMetadata(inputFile);

    expect(result.type).toBe('image/png');
    expect(mockCanvas.width).toBe(1536);
    expect(mockCanvas.height).toBe(1536);
    expect(mockContext.drawImage).toHaveBeenCalledTimes(2);
    expect(mockCanvas.toBlob).toHaveBeenCalledTimes(2);
  });

  it('reduces JPEG quality before downscaling dimensions', async () => {
    mockToBlobSizes([IMAGE_MAX_UPLOAD_SIZE + 1, IMAGE_MAX_UPLOAD_SIZE - 1]);
    const inputFile = new File(['raw-image-bytes'], 'large-photo.jpg', { type: 'image/jpeg' });

    const result = await stripImageMetadata(inputFile);

    expect(result.type).toBe('image/jpeg');
    expect(mockContext.drawImage).toHaveBeenCalledTimes(1);
    expect(mockCanvas.toBlob).toHaveBeenCalledTimes(2);
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe(IMAGE_ENCODE_QUALITY);
    expect((mockCanvas.toBlob as ReturnType<typeof vi.fn>).mock.calls[1][2]).toBe(IMAGE_COMPRESSION_QUALITY_STEPS[1]);
  });

  it('throws when progressive compression cannot get below the upload limit', async () => {
    mockToBlobSizes([IMAGE_MAX_UPLOAD_SIZE + 1]);
    const inputFile = new File(['raw-image-bytes'], 'stubborn.jpg', { type: 'image/jpeg' });

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('IMAGE_UPLOAD_SIZE_LIMIT:raster');
  });

  it('rejects GIF files over the upload limit after sanitization', async () => {
    const inputFile = new File(['original-content'], 'animated.gif', { type: 'image/gif' });
    Object.defineProperty(inputFile, 'size', { value: IMAGE_MAX_UPLOAD_SIZE + 1 });

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('IMAGE_UPLOAD_SIZE_LIMIT:gif');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('rejects animated WebP over the upload limit after sanitization', async () => {
    const animatedWebp = buildWebpBytes([
      { type: 'ANIM', payload: new Uint8Array([0, 0, 0, 0, 0, 0]) },
      { type: 'VP8 ', payload: new Uint8Array(IMAGE_MAX_UPLOAD_SIZE + 1) },
    ]);
    const inputFile = new File([animatedWebp], 'loop.webp', { type: 'image/webp' });

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('IMAGE_UPLOAD_SIZE_LIMIT:animated-webp');
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });
});
