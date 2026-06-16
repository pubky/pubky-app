import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_ENCODE_QUALITY, IMAGE_MAX_DIMENSION } from '@/config/images';
import { asOpaque } from '@/test-utils/type-assertions';
import { stripImageMetadata } from './stripImageMetadata';

describe('stripImageMetadata', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockContext: CanvasRenderingContext2D;
  let mockImage: HTMLImageElement;
  let originalImageConstructor: typeof Image;

  beforeEach(() => {
    originalImageConstructor = global.Image;

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
  });

  function setMockImageDimensions(width: number, height: number): void {
    Object.assign(mockImage, {
      naturalWidth: width,
      naturalHeight: height,
      width,
      height,
    });
  }

  it('sanitizes supported image types and returns a new file', async () => {
    const inputFile = new File(['raw-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });

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
});
