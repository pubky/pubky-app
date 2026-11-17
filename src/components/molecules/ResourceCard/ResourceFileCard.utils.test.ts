import { describe, expect, it } from 'vitest';
import { formatFileSize, getFileDetailsLine } from './ResourceFileCard.utils';

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [89, '89 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [49348, '48.2 KB'],
    [1024 * 1024 - 1, '1 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [2 * 1024 * 1024 * 1024, '2 GB'],
    [3 * 1024 ** 4, '3 TB'],
    [5 * 1024 ** 5, '5120 TB'],
  ])('reads %d bytes as %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('reads nothing in %d', (bytes) => {
    expect(formatFileSize(bytes)).toBeNull();
  });
});

describe('getFileDetailsLine', () => {
  it('gives the type and the size', () => {
    expect(getFileDetailsLine({ content_type: 'text/plain', size: 89 })).toBe('text/plain · 89 B');
  });

  it('leaves out what is not known, and gives nothing without either', () => {
    expect(getFileDetailsLine({ content_type: 'image/png', size: 0 })).toBe('image/png');
    expect(getFileDetailsLine({ content_type: ' ', size: 2048 })).toBe('2 KB');
    expect(getFileDetailsLine({ content_type: '', size: 0 })).toBeNull();
  });
});
