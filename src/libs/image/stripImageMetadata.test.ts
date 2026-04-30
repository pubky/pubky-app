import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils';
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
    expect(URL.createObjectURL).toHaveBeenCalledWith(inputFile);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:input-image');
  });

  it('leaves non-image files unchanged', async () => {
    const inputFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });

    const result = await stripImageMetadata(inputFile);

    expect(result).toBe(inputFile);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it.each([
    ['image/gif', 'animated.gif', 'gif'],
    ['image/svg+xml', 'icon.svg', 'svg'],
  ])('keeps %s bytes unchanged while obfuscating filename', async (mimeType, fileName, extension) => {
    const inputFile = new File(['original-content'], fileName, { type: mimeType });

    const result = await stripImageMetadata(inputFile);

    expect(result).toBeInstanceOf(File);
    expect(result).not.toBe(inputFile);
    expect(result.type).toBe(mimeType);
    expect(result.name).not.toBe(fileName);
    expect(result.name).toMatch(new RegExp(`^[a-z0-9]+\\.${extension}$`));
    expect(await result.text()).toBe(await inputFile.text());
    expect(mockCanvas.toBlob).not.toHaveBeenCalled();
  });

  it('throws when sanitization fails for supported formats', async () => {
    (mockCanvas.toBlob as ReturnType<typeof vi.fn>).mockImplementation((callback) => callback(null));

    const inputFile = new File(['raw-image-bytes'], 'broken.webp', { type: 'image/webp' });

    await expect(stripImageMetadata(inputFile)).rejects.toThrow('Failed to encode sanitized image');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:input-image');
  });
});
