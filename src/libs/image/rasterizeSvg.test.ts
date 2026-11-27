import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_MAX_DIMENSION } from '@/config/images';
import { asOpaque } from '@/test-utils/type-assertions';
import { rasterizeSvg } from './rasterizeSvg';

const EDGE = IMAGE_MAX_DIMENSION;
const svg = (attributes: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}/>`);

// jsdom cannot load or draw an SVG, so the image and the canvas are stand-ins.
describe('rasterizeSvg', () => {
  let natural: { width: number; height: number };
  let loads: boolean;
  let encoded: Blob | null;
  let context: object | null;
  let encodeError: Error | null;
  let canvas: {
    width: number;
    height: number;
    getContext: () => unknown;
    toBlob: (done: (blob: Blob | null) => void) => void;
  };
  const drawImage = vi.fn();

  beforeEach(() => {
    natural = { width: 300, height: 150 };
    loads = true;
    encoded = new Blob([new Uint8Array([9])], { type: 'image/png' });
    context = { drawImage };
    encodeError = null;
    drawImage.mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    vi.stubGlobal(
      'Image',
      class {
        private listeners: Record<string, () => void> = {};
        get naturalWidth() {
          return natural.width;
        }
        get naturalHeight() {
          return natural.height;
        }
        addEventListener(type: string, listener: () => void) {
          this.listeners[type] = listener;
        }
        set src(_url: string) {
          queueMicrotask(() => this.listeners[loads ? 'load' : 'error']?.());
        }
      },
    );
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return createElement(tag);
      canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (done) => {
          if (encodeError) throw encodeError;
          done(encoded);
        },
      };
      return asOpaque<HTMLCanvasElement>(canvas);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws an SVG with a fixed size in that shape, and returns the PNG bytes', async () => {
    natural = { width: 200, height: 100 };

    const png = await rasterizeSvg(svg('width="200" height="100" viewBox="0 0 100 100"'));

    expect(png).toEqual(new Uint8Array([9]));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, EDGE, EDGE / 2);
  });

  it('keeps a fixed 300×150 size, even with a square viewBox', async () => {
    await rasterizeSvg(svg('width="300" height="150" viewBox="0 0 10 10"'));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, EDGE, EDGE / 2);
  });

  it('takes the viewBox shape for a size in percent', async () => {
    await rasterizeSvg(svg('width="100%" height="100%" viewBox="0 0 50 100"'));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, EDGE / 2, EDGE);
  });

  it('takes the viewBox shape for an SVG the browser reports at its default 300×150', async () => {
    await rasterizeSvg(svg('viewBox="0 0 50 100"'));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, EDGE / 2, EDGE);
  });

  it('draws a square when the browser reports no size and there is no viewBox', async () => {
    natural = { width: 0, height: 0 };

    await rasterizeSvg(svg(''));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, EDGE, EDGE);
  });

  it('frees the canvas once it has the PNG', async () => {
    await rasterizeSvg(svg('viewBox="0 0 1 1"'));

    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('returns null, and releases the SVG URL, when the browser cannot load the SVG', async () => {
    loads = false;

    await expect(rasterizeSvg(svg(''))).resolves.toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('returns null when the drawing cannot be encoded as a PNG', async () => {
    encoded = null;

    await expect(rasterizeSvg(svg('viewBox="0 0 1 1"'))).resolves.toBeNull();
  });

  it('returns null, and frees the URL and the canvas, when the canvas has no 2D context', async () => {
    context = null;

    await expect(rasterizeSvg(svg('viewBox="0 0 1 1"'))).resolves.toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('returns null, and frees the URL and the canvas, when the browser refuses to encode the canvas', async () => {
    encodeError = new DOMException('The canvas has been tainted', 'SecurityError');

    await expect(rasterizeSvg(svg('viewBox="0 0 1 1"'))).resolves.toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});
