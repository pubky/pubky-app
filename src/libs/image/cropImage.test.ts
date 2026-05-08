import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { cropImageToBlob } from './cropImage';

describe('cropImage', () => {
  describe('cropImageToBlob', () => {
    // Mock canvas and context
    let mockCanvas: HTMLCanvasElement;
    let mockContext: CanvasRenderingContext2D;
    let mockImage: HTMLImageElement;

    beforeEach(() => {
      // Mock canvas context
      mockContext = asOpaque<CanvasRenderingContext2D>({
        drawImage: vi.fn(),
        imageSmoothingQuality: 'low',
      });

      mockCanvas = asOpaque<HTMLCanvasElement>({
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => {
          const blob = new Blob(['fake image data'], { type: 'image/png' });
          callback(blob);
        }),
      });

      vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }
        return document.createElement(tagName);
      });

      mockImage = asOpaque<HTMLImageElement>({
        addEventListener: vi.fn((event, handler) => {
          if (event === 'load') {
            setTimeout(() => handler(new Event('load')), 0);
          }
        }),
        crossOrigin: null,
        src: '',
      });

      // @ts-expect-error - mocking global Image
      global.Image = class {
        addEventListener = mockImage.addEventListener;
        crossOrigin = mockImage.crossOrigin;
        src = mockImage.src;

        constructor() {
          return mockImage;
        }
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('basic functionality', () => {
      it('crops image and returns blob', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        const blob = await cropImageToBlob(imageSrc, cropArea);

        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(0);
      });

      it('sets canvas dimensions to crop area size', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 10, y: 20, width: 150, height: 200 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockCanvas.width).toBe(150);
        expect(mockCanvas.height).toBe(200);
      });

      it('sets high quality image smoothing', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockContext.imageSmoothingQuality).toBe('high');
      });

      it('calls drawImage with correct parameters', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 10, y: 20, width: 100, height: 150 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockContext.drawImage).toHaveBeenCalledWith(
          mockImage,
          10, // source x
          20, // source y
          100, // source width
          150, // source height
          0, // dest x
          0, // dest y
          100, // dest width
          150, // dest height
        );
      });
    });

    describe('image loading', () => {
      it('sets crossOrigin for external URLs', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockImage.crossOrigin).toBe('anonymous');
      });

      it('does not set crossOrigin for data URLs', async () => {
        const imageSrc = 'data:image/png;base64,iVBORw0KG';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockImage.crossOrigin).toBeNull();
      });

      it('does not set crossOrigin for blob URLs', async () => {
        const imageSrc = 'blob:http://localhost/123-456';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockImage.crossOrigin).toBeNull();
      });

      it('sets image src', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockImage.src).toBe(imageSrc);
      });
    });

    describe('blob creation', () => {
      it('creates blob with default PNG mime type', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
      });

      it('creates blob with custom mime type', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea, 'image/jpeg');

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', undefined);
      });

      it('creates blob with quality parameter', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea, 'image/jpeg', 0.8);

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
      });

      it('supports webp format', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea, 'image/webp', 0.9);

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
      });
    });

    describe('crop area handling', () => {
      it('handles decimal crop coordinates', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 10.5, y: 20.7, width: 100.3, height: 150.9 };

        await cropImageToBlob(imageSrc, cropArea);

        // Should round width and height
        expect(mockCanvas.width).toBe(100);
        expect(mockCanvas.height).toBe(151);
      });

      it('handles zero crop position', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockContext.drawImage).toHaveBeenCalledWith(mockImage, 0, 0, 100, 100, 0, 0, 100, 100);
      });

      it('handles large crop areas', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 4000, height: 3000 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockCanvas.width).toBe(4000);
        expect(mockCanvas.height).toBe(3000);
      });

      it('handles small crop areas', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 10, height: 10 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockCanvas.width).toBe(10);
        expect(mockCanvas.height).toBe(10);
      });
    });

    describe('error handling', () => {
      it('throws error when imageSrc is empty', async () => {
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await expect(cropImageToBlob('', cropArea)).rejects.toThrow('Image source is required to crop');
      });

      it('throws error when canvas context is null', async () => {
        mockCanvas.getContext = vi.fn(() => null);

        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await expect(cropImageToBlob(imageSrc, cropArea)).rejects.toThrow('Failed to get canvas context');
      });

      it('throws error when blob creation fails', async () => {
        mockCanvas.toBlob = vi.fn((callback) => {
          callback(null);
        });

        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await expect(cropImageToBlob(imageSrc, cropArea)).rejects.toThrow('Failed to crop image');
      });

      it('throws error when image fails to load', async () => {
        mockImage.addEventListener = vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Event('error')), 0);
          }
        });

        const imageSrc = 'https://example.com/invalid.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await expect(cropImageToBlob(imageSrc, cropArea)).rejects.toThrow();
      });
    });

    describe('edge cases', () => {
      it('handles very small dimensions', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 1, height: 1 };

        const blob = await cropImageToBlob(imageSrc, cropArea);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockCanvas.width).toBe(1);
        expect(mockCanvas.height).toBe(1);
      });

      it('handles fractional dimensions that round to same value', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100.4, height: 100.4 };

        await cropImageToBlob(imageSrc, cropArea);

        expect(mockCanvas.width).toBe(100);
        expect(mockCanvas.height).toBe(100);
      });

      it('handles maximum quality value', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea, 'image/jpeg', 1.0);

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 1.0);
      });

      it('handles minimum quality value', async () => {
        const imageSrc = 'https://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        await cropImageToBlob(imageSrc, cropArea, 'image/jpeg', 0.0);

        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.0);
      });
    });

    describe('different image sources', () => {
      it('handles HTTPS URLs', async () => {
        const imageSrc = 'https://example.com/secure/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        const blob = await cropImageToBlob(imageSrc, cropArea);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockImage.crossOrigin).toBe('anonymous');
      });

      it('handles HTTP URLs', async () => {
        const imageSrc = 'http://example.com/image.jpg';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        const blob = await cropImageToBlob(imageSrc, cropArea);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockImage.crossOrigin).toBe('anonymous');
      });

      it('handles data URLs', async () => {
        const imageSrc =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        const blob = await cropImageToBlob(imageSrc, cropArea);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockImage.crossOrigin).toBeNull();
      });

      it('handles blob URLs', async () => {
        const imageSrc = 'blob:http://localhost:3000/550e8400-e29b-41d4-a716-446655440000';
        const cropArea = { x: 0, y: 0, width: 100, height: 100 };

        const blob = await cropImageToBlob(imageSrc, cropArea);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockImage.crossOrigin).toBeNull();
      });
    });

    describe('integration scenarios', () => {
      it('creates valid crop for profile picture scenario', async () => {
        const imageSrc = 'https://example.com/profile.jpg';
        const cropArea = { x: 50, y: 100, width: 200, height: 200 }; // Square crop

        const blob = await cropImageToBlob(imageSrc, cropArea, 'image/jpeg', 0.9);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockCanvas.width).toBe(200);
        expect(mockCanvas.height).toBe(200);
        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
      });

      it('creates valid crop for banner scenario', async () => {
        const imageSrc = 'https://example.com/banner.jpg';
        const cropArea = { x: 0, y: 50, width: 1200, height: 300 }; // Wide crop

        const blob = await cropImageToBlob(imageSrc, cropArea, 'image/png');

        expect(blob).toBeInstanceOf(Blob);
        expect(mockCanvas.width).toBe(1200);
        expect(mockCanvas.height).toBe(300);
      });

      it('creates valid crop for thumbnail scenario', async () => {
        const imageSrc = 'https://example.com/photo.jpg';
        const cropArea = { x: 10, y: 10, width: 150, height: 150 };

        const blob = await cropImageToBlob(imageSrc, cropArea, 'image/webp', 0.8);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockCanvas.width).toBe(150);
        expect(mockCanvas.height).toBe(150);
        expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.8);
      });
    });
  });
});
