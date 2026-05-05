import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocaleCookie } from './utils';

describe('setLocaleCookie', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('should set locale cookie with encoded value', () => {
    setLocaleCookie('en');

    expect(document.cookie).toBe('locale=en;path=/;max-age=31536000;SameSite=Lax');
  });

  it('should encode special characters in locale', () => {
    setLocaleCookie('zh-Hant');

    expect(document.cookie).toBe('locale=zh-Hant;path=/;max-age=31536000;SameSite=Lax');
  });

  it('should add Secure flag on HTTPS', () => {
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:' },
      writable: true,
    });

    setLocaleCookie('en');

    expect(document.cookie).toBe('locale=en;path=/;max-age=31536000;SameSite=Lax;Secure');
  });

  it('should not add Secure flag on HTTP', () => {
    setLocaleCookie('en');

    expect(document.cookie).not.toContain(';Secure');
  });

  it('should encode URI-unsafe characters in locale', () => {
    setLocaleCookie('a b&c');

    expect(document.cookie).toBe('locale=a%20b%26c;path=/;max-age=31536000;SameSite=Lax');
  });

  it('should no-op when document is undefined (SSR)', () => {
    const originalDoc = globalThis.document;
    // @ts-expect-error — `document` is non-optional in DOM types, but we need to
    // delete it to simulate a server-side environment where `document` does not exist.
    delete globalThis.document;

    expect(() => setLocaleCookie('en')).not.toThrow();

    globalThis.document = originalDoc;
  });
});
