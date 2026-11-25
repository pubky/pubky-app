import { describe, expect, it } from 'vitest';
import { isFaviconContentType, readBodyBytes, sniffImageType } from './favicon.utils';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('sniffImageType', () => {
  it('names the raster formats a favicon comes in by their first bytes', () => {
    expect(sniffImageType(bytes(0x00, 0x00, 0x01, 0x00, 0x01, 0x00))).toBe('image/x-icon');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe('image/png');
    expect(sniffImageType(text('GIF89a...'))).toBe('image/gif');
    expect(sniffImageType(text('GIF87a...'))).toBe('image/gif');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses SVG, HTML and anything else, also when too short', () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(text('<?xml version="1.0"?><svg/>'))).toBeNull();
    expect(sniffImageType(text('<!DOCTYPE html><html></html>'))).toBeNull();
    expect(sniffImageType(text('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });
});

describe('isFaviconContentType', () => {
  it('lets raster images, generic binary and no type through to the byte check', () => {
    expect(isFaviconContentType('image/x-icon')).toBe(true);
    expect(isFaviconContentType('image/vnd.microsoft.icon')).toBe(true);
    expect(isFaviconContentType('image/png; charset=binary')).toBe(true);
    expect(isFaviconContentType('application/octet-stream')).toBe(true);
    expect(isFaviconContentType(null)).toBe(true);
  });

  it('refuses SVG and documents', () => {
    expect(isFaviconContentType('image/svg+xml')).toBe(false);
    expect(isFaviconContentType('text/html; charset=utf-8')).toBe(false);
    expect(isFaviconContentType('application/json')).toBe(false);
  });
});

describe('readBodyBytes', () => {
  const streamed = (...chunks: Uint8Array[]) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
    );

  it('joins the body up to the cap', async () => {
    await expect(readBodyBytes(streamed(bytes(1, 2), bytes(3)), 3)).resolves.toEqual(bytes(1, 2, 3));
  });

  it('stops at the first byte past the cap, whatever the headers said', async () => {
    await expect(readBodyBytes(streamed(bytes(1, 2), bytes(3, 4)), 3)).resolves.toBeNull();
  });

  it('gives nothing for a body that fails mid-read or is missing', async () => {
    const failing = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes(1));
          controller.error(new Error('reset'));
        },
      }),
    );
    await expect(readBodyBytes(failing, 10)).resolves.toBeNull();
    await expect(readBodyBytes(new Response(null), 10)).resolves.toBeNull();
  });
});
