import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DecodedImage,
  type DecodeImage,
  decodeImageWithCanvas,
  fitToWidth,
  type ImageSize,
  isAnimatedImage,
  isLocalMediaVariant,
  isScalableImageType,
  scaleImageVariant,
  variantEncodings,
} from './localMediaVariant';

/** A blob from the same realm as `Response`, so it reads back like a cached body. */
const blobOf = (bytes: string | Uint8Array, type = '') =>
  new Response(typeof bytes === 'string' ? bytes : Uint8Array.from(bytes), {
    headers: { 'Content-Type': type },
  }).blob();

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const uint32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type: string, length = 0) => [...uint32(length), ...ascii(type), ...new Array(length + 4).fill(0)];
const webp = (flags: number) =>
  Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8X'), 10, 0, 0, 0, flags]);

describe('variant names', () => {
  it('knows the Nexus image variants and nothing else', () => {
    expect(['small', 'feed', 'large'].every(isLocalMediaVariant)).toBe(true);
    expect(isLocalMediaVariant('main')).toBe(false);
    expect(isLocalMediaVariant('toString')).toBe(false);
  });
});

describe('fitToWidth', () => {
  it('scales a wider image down to the width, keeping its aspect', () => {
    expect(fitToWidth({ width: 2304, height: 800 }, 720)).toEqual({ width: 720, height: 250 });
    expect(fitToWidth({ width: 4000, height: 3000 }, 1440)).toEqual({ width: 1440, height: 1080 });
  });

  it('constrains the width alone, as a tall image keeps its height ratio', () => {
    expect(fitToWidth({ width: 1000, height: 5000 }, 320)).toEqual({ width: 320, height: 1600 });
  });

  it('never enlarges', () => {
    expect(fitToWidth({ width: 720, height: 2000 }, 720)).toBeNull();
    expect(fitToWidth({ width: 100, height: 100 }, 320)).toBeNull();
  });

  it('keeps at least one pixel of height', () => {
    expect(fitToWidth({ width: 10000, height: 1 }, 320)).toEqual({ width: 320, height: 1 });
  });
});

describe('isScalableImageType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'IMAGE/PNG; charset=binary'])('scales %s', (type) => {
    expect(isScalableImageType(type)).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'video/mp4', 'audio/mpeg', 'application/pdf'])('keeps %s', (type) => {
    expect(isScalableImageType(type)).toBe(false);
  });
});

describe('variantEncodings', () => {
  it('prefers WebP, then keeps transparency in PNG for a format that can carry it', () => {
    expect(variantEncodings('image/png')).toEqual(['image/webp', 'image/png']);
    expect(variantEncodings('image/webp')).toEqual(['image/webp', 'image/png']);
  });

  it('falls back to JPEG for an opaque format', () => {
    expect(variantEncodings('image/jpeg')).toEqual(['image/webp', 'image/jpeg']);
    expect(variantEncodings('image/heic')).toEqual(['image/webp', 'image/jpeg']);
  });
});

describe('isAnimatedImage', () => {
  it('finds the animation control chunk of an APNG before its image data', () => {
    const apng = [...PNG_SIGNATURE, ...pngChunk('IHDR', 13), ...pngChunk('acTL', 8), ...pngChunk('IDAT', 2)];
    expect(isAnimatedImage(Uint8Array.from(apng))).toBe(true);
  });

  it('sees a still PNG', () => {
    const png = [...PNG_SIGNATURE, ...pngChunk('IHDR', 13), ...pngChunk('IDAT', 2), ...pngChunk('acTL', 8)];
    expect(isAnimatedImage(Uint8Array.from(png))).toBe(false);
  });

  it('reads the animation flag of an extended WebP', () => {
    expect(isAnimatedImage(webp(0x02))).toBe(true);
    expect(isAnimatedImage(webp(0x10))).toBe(false);
  });

  it('sees nothing in other or truncated bytes', () => {
    expect(isAnimatedImage(Uint8Array.from(ascii('\xff\xd8\xff')))).toBe(false);
    expect(isAnimatedImage(Uint8Array.from(PNG_SIGNATURE))).toBe(false);
  });
});

describe('scaleImageVariant', () => {
  function decoderOf(image: Partial<DecodedImage> = {}) {
    const decoded: DecodedImage = {
      width: 2000,
      height: 1000,
      encode: vi.fn(async (_size: ImageSize, types: readonly string[]) => blobOf('scaled', types[0])),
      close: vi.fn(),
      ...image,
    };
    return { decoded, decode: vi.fn<DecodeImage>(async () => decoded) };
  }

  it('encodes the image at the fitted size as the first format the browser writes', async () => {
    const { decoded, decode } = decoderOf();

    const variant = await scaleImageVariant({ blob: await blobOf('jpeg'), contentType: 'image/jpeg' }, 720, decode);

    expect(variant).toMatchObject({ contentType: 'image/webp' });
    expect(decoded.encode).toHaveBeenCalledWith({ width: 720, height: 360 }, ['image/webp', 'image/jpeg']);
    expect(decoded.close).toHaveBeenCalled();
  });

  it('keeps an animated image as the original without decoding it', async () => {
    const { decode } = decoderOf();

    const variant = await scaleImageVariant({ blob: await blobOf(webp(0x02)), contentType: 'image/webp' }, 720, decode);

    expect(variant).toBe('original');
    expect(decode).not.toHaveBeenCalled();
  });

  it('keeps an image the browser cannot decode as the original', async () => {
    const variant = await scaleImageVariant(
      { blob: await blobOf('heic'), contentType: 'image/heic' },
      720,
      async () => null,
    );

    expect(variant).toBe('original');
  });

  it('fails when no format can be written', async () => {
    const { decoded, decode } = decoderOf({ encode: vi.fn(async () => null) });

    const variant = await scaleImageVariant({ blob: await blobOf('png'), contentType: 'image/png' }, 720, decode);

    expect(variant).toBe('failed');
    expect(decoded.close).toHaveBeenCalled();
  });

  it('fails when decoding throws', async () => {
    const variant = await scaleImageVariant({ blob: await blobOf('png'), contentType: 'image/png' }, 720, async () => {
      throw new DOMException('broken', 'InvalidStateError');
    });

    expect(variant).toBe('failed');
  });
});

describe('decodeImageWithCanvas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stubs the worker's image globals; the canvas writes the types in `writes`, and PNG for anything else. */
  function stubCanvas({ writes = ['image/png', 'image/webp', 'image/jpeg'], decodes = true } = {}) {
    const bitmap = { width: 1200, height: 900, close: vi.fn() };
    const createImageBitmap = vi.fn(async () => {
      if (!decodes) throw new DOMException('cannot decode', 'InvalidStateError');
      return bitmap;
    });
    const drawImage = vi.fn();
    const asked: string[] = [];
    class FakeOffscreenCanvas {
      getContext() {
        return { drawImage, imageSmoothingQuality: 'low' };
      }
      async convertToBlob({ type = 'image/png' }: { type?: string } = {}) {
        asked.push(type);
        return blobOf('encoded', writes.indexOf(type) >= 0 ? type : 'image/png');
      }
    }
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    return { bitmap, createImageBitmap, drawImage, asked };
  }

  it('decodes with the EXIF orientation applied and draws at the asked size', async () => {
    const { bitmap, createImageBitmap, drawImage } = stubCanvas();
    const source = await blobOf('jpeg', 'image/jpeg');

    const image = await decodeImageWithCanvas(source);
    const blob = await image?.encode({ width: 720, height: 540 }, ['image/webp', 'image/jpeg']);

    expect(createImageBitmap).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
    expect(image).toMatchObject({ width: 1200, height: 900 });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 720, 540);
    expect(blob?.type).toBe('image/webp');
  });

  it('falls back to the next format when the browser writes PNG for WebP', async () => {
    const { asked } = stubCanvas({ writes: ['image/png', 'image/jpeg'] });

    const image = await decodeImageWithCanvas(await blobOf('jpeg', 'image/jpeg'));
    const blob = await image?.encode({ width: 720, height: 540 }, ['image/webp', 'image/jpeg']);

    expect(asked).toEqual(['image/webp', 'image/jpeg']);
    expect(blob?.type).toBe('image/jpeg');
  });

  it('takes the PNG it was handed when PNG is the fallback', async () => {
    const { asked } = stubCanvas({ writes: ['image/png'] });

    const image = await decodeImageWithCanvas(await blobOf('png', 'image/png'));
    const blob = await image?.encode({ width: 720, height: 540 }, ['image/webp', 'image/png']);

    expect(asked).toEqual(['image/webp']);
    expect(blob?.type).toBe('image/png');
  });

  it('answers null for an image the browser cannot decode, and closes the bitmap it decoded', async () => {
    stubCanvas({ decodes: false });
    expect(await decodeImageWithCanvas(await blobOf('x'))).toBeNull();

    const { bitmap } = stubCanvas();
    const image = await decodeImageWithCanvas(await blobOf('x'));
    image?.close();
    expect(bitmap.close).toHaveBeenCalled();
  });
});
