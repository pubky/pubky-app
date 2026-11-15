import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { normalizePubchiAudience } from './audience';

describe('normalizePubchiAudience', () => {
  it.each(['', 'not a URL', 'javascript:alert(1)', 'ftp://example.com'])('rejects %s with an AppError', (url) => {
    expect(() => normalizePubchiAudience(url)).toThrow(AppError);
  });
  it.each([
    ['HTTPS://PUBCHI-EXAMPLE.COM:443/path/', 'https://pubchi-example.com'],
    ['http://PUBCHI-EXAMPLE.COM:80/v1', 'http://pubchi-example.com'],
    ['https://pubchi-example.com:8443/v1/', 'https://pubchi-example.com:8443'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePubchiAudience(input)).toBe(expected);
  });
});
