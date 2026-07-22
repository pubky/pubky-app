import { describe, expect, it } from 'vitest';
import { getSafeExternalUrl, safeExternalUrlSchema } from './safeExternalUrl';

describe('safeExternalUrl', () => {
  it.each([
    ['https://example.com/path', 'https://example.com/path'],
    ['http://example.com', 'http://example.com'],
    ['mailto:test@example.com', 'mailto:test@example.com'],
    ['tel:+1234567890', 'tel:+1234567890'],
    ['  HTTPS://example.com/path  ', 'HTTPS://example.com/path'],
  ])('accepts the supported external URL %s', (url, expected) => {
    expect(getSafeExternalUrl(url)).toBe(expected);
    expect(safeExternalUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' \u0000javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.com/id',
    'ftp://files.example.com',
    'https:evil.com',
    'http:example.com',
    'https:/path',
    '//example.com/path',
    '/relative/path',
    'not-a-url',
    '',
  ])('rejects the unsupported or malformed external URL %s', (url) => {
    expect(getSafeExternalUrl(url)).toBeNull();
    expect(safeExternalUrlSchema.safeParse(url).success).toBe(false);
  });
});
