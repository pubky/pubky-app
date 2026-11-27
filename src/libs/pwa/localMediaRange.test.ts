// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseByteRange, rangedResponse } from './localMediaRange';

/** A blob from the same realm as `Response`, as the worker reads one from Cache Storage. */
const blobOf = (text: string) => new Response(text).blob();

describe('parseByteRange', () => {
  it.each([
    ['bytes=0-9', { start: 0, end: 9 }],
    ['bytes=10-', { start: 10, end: 99 }],
    ['bytes=-10', { start: 90, end: 99 }],
    ['bytes=90-500', { start: 90, end: 99 }],
    ['bytes=-500', { start: 0, end: 99 }],
    ['Bytes = 5 - 5', { start: 5, end: 5 }],
  ])('reads %s of 100 bytes', (header, range) => {
    expect(parseByteRange(header, 100)).toEqual(range);
  });

  it.each(['bytes=100-', 'bytes=150-200', 'bytes=-0'])('finds %s of 100 bytes unsatisfiable', (header) => {
    expect(parseByteRange(header, 100)).toBe('unsatisfiable');
  });

  it('finds every range of an empty body unsatisfiable', () => {
    expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-5', 0)).toBe('unsatisfiable');
  });

  it.each([null, '', 'bytes=0-9,20-29', 'items=0-9', 'bytes=9-0', 'bytes=-', 'bytes=a-b', 'bytes 0-9'])(
    'answers %j with the whole body',
    (header) => {
      expect(parseByteRange(header, 100)).toBeNull();
    },
  );
});

describe('rangedResponse', () => {
  const headers = () => new Headers({ 'Content-Type': 'video/mp4', 'Content-Security-Policy': 'sandbox' });

  it('answers a range with its slice, as a 206', async () => {
    const response = rangedResponse(await blobOf('0123456789abcdef'), headers(), 'bytes=2-5');

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/16');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
    expect(await response.text()).toBe('2345');
  });

  it('answers a suffix range with the last bytes', async () => {
    const response = rangedResponse(await blobOf('0123456789abcdef'), headers(), 'bytes=-3');

    expect(response.headers.get('content-range')).toBe('bytes 13-15/16');
    expect(await response.text()).toBe('def');
  });

  it('answers a range past the end with a 416 naming the size', async () => {
    const response = rangedResponse(await blobOf('0123456789'), headers(), 'bytes=10-');

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
    expect(await response.text()).toBe('');
  });

  it.each([null, 'bytes=0-1,4-5'])('answers %j with the whole body, saying ranges are accepted', async (range) => {
    const response = rangedResponse(await blobOf('0123456789'), headers(), range);

    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-range')).toBeNull();
    expect(await response.text()).toBe('0123456789');
  });
});
