import { describe, expect, it } from 'vitest';
import {
  generateBitkitContactDeeplink,
  GenerateDeeplinkOptions,
  generatePubkyRingDeeplink,
  toBitkitIosAuthUrl,
} from './deeplink';

describe('generatePubkyRingDeeplink', () => {
  describe('basic functionality', () => {
    it('should generate deeplink with default encoding', () => {
      const value = 'test-value';
      const result = generatePubkyRingDeeplink(value);

      expect(result).toBe('pubkyring://test-value');
    });

    it('should generate deeplink with explicit encoding enabled', () => {
      const value = 'test-value';
      const result = generatePubkyRingDeeplink(value, { encode: true });

      expect(result).toBe('pubkyring://test-value');
    });

    it('should generate deeplink without encoding when disabled', () => {
      const value = 'test-value';
      const result = generatePubkyRingDeeplink(value, { encode: false });

      expect(result).toBe('pubkyring://test-value');
    });

    it('should handle empty string', () => {
      const result = generatePubkyRingDeeplink('');

      expect(result).toBe('pubkyring://');
    });
  });

  describe('encoding behavior', () => {
    it('should encode spaces when encoding is enabled', () => {
      const value = 'test value with spaces';
      const result = generatePubkyRingDeeplink(value, { encode: true });

      expect(result).toBe('pubkyring://test%20value%20with%20spaces');
    });

    it('should not encode spaces when encoding is disabled', () => {
      const value = 'test value with spaces';
      const result = generatePubkyRingDeeplink(value, { encode: false });

      expect(result).toBe('pubkyring://test value with spaces');
    });

    it('should encode special characters when encoding is enabled', () => {
      const value = 'test&value=with+special/chars';
      const result = generatePubkyRingDeeplink(value, { encode: true });

      expect(result).toBe('pubkyring://test%26value%3Dwith%2Bspecial%2Fchars');
    });

    it('should not encode special characters when encoding is disabled', () => {
      const value = 'test&value=with+special/chars';
      const result = generatePubkyRingDeeplink(value, { encode: false });

      expect(result).toBe('pubkyring://test&value=with+special/chars');
    });

    it('should encode Unicode characters when encoding is enabled', () => {
      const value = 'test with émojis 🎉';
      const result = generatePubkyRingDeeplink(value, { encode: true });

      expect(result).toBe('pubkyring://test%20with%20%C3%A9mojis%20%F0%9F%8E%89');
    });

    it('should not encode Unicode characters when encoding is disabled', () => {
      const value = 'test with émojis 🎉';
      const result = generatePubkyRingDeeplink(value, { encode: false });

      expect(result).toBe('pubkyring://test with émojis 🎉');
    });
  });

  describe('mnemonic phrase scenarios', () => {
    it('should encode mnemonic phrase with spaces', () => {
      const mnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
      const result = generatePubkyRingDeeplink(mnemonic);

      expect(result).toBe(
        'pubkyring://wood%20fox%20silver%20drive%20march%20fee%20palace%20flame%20earn%20door%20case%20almost',
      );
    });

    it('should handle mnemonic phrase without encoding', () => {
      const mnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
      const result = generatePubkyRingDeeplink(mnemonic, { encode: false });

      expect(result).toBe('pubkyring://wood fox silver drive march fee palace flame earn door case almost');
    });
  });

  describe('auth URL scenarios', () => {
    it('should not encode auth URL when encoding is disabled', () => {
      const authUrl = 'https://example.com/auth?token=abc123&expires=1234567890';
      const result = generatePubkyRingDeeplink(authUrl, { encode: false });

      expect(result).toBe('pubkyring://https://example.com/auth?token=abc123&expires=1234567890');
    });

    it('should encode auth URL when encoding is enabled', () => {
      const authUrl = 'https://example.com/auth?token=abc123&expires=1234567890';
      const result = generatePubkyRingDeeplink(authUrl, { encode: true });

      expect(result).toBe('pubkyring://https%3A%2F%2Fexample.com%2Fauth%3Ftoken%3Dabc123%26expires%3D1234567890');
    });
  });

  describe('edge cases', () => {
    it('should handle value with only special characters', () => {
      const value = '!@#$%^&*()';
      const result = generatePubkyRingDeeplink(value, { encode: true });

      // encodeURIComponent doesn't encode unreserved characters like !, *, (, )
      expect(result).toBe('pubkyring://!%40%23%24%25%5E%26*()');
    });

    it('should handle very long value', () => {
      const value = 'a'.repeat(1000);
      const result = generatePubkyRingDeeplink(value);

      expect(result).toBe(`pubkyring://${value}`);
    });

    it('should handle value with newlines when encoding', () => {
      const value = 'line1\nline2\nline3';
      const result = generatePubkyRingDeeplink(value, { encode: true });

      expect(result).toBe('pubkyring://line1%0Aline2%0Aline3');
    });

    it('should handle value with newlines when not encoding', () => {
      const value = 'line1\nline2\nline3';
      const result = generatePubkyRingDeeplink(value, { encode: false });

      expect(result).toBe('pubkyring://line1\nline2\nline3');
    });
  });

  describe('type safety', () => {
    it('should accept GenerateDeeplinkOptions type', () => {
      const options: GenerateDeeplinkOptions = { encode: true };
      const result = generatePubkyRingDeeplink('test', options);

      expect(result).toBe('pubkyring://test');
    });

    it('should accept empty options object', () => {
      const result = generatePubkyRingDeeplink('test', {});

      expect(result).toBe('pubkyring://test');
    });

    it('should accept undefined options', () => {
      const result = generatePubkyRingDeeplink('test', undefined);

      expect(result).toBe('pubkyring://test');
    });
  });
});

describe('generateBitkitContactDeeplink', () => {
  it('builds the contact link Bitkit routes to its add-contact screen', () => {
    expect(generateBitkitContactDeeplink('pubkylockcreator')).toBe('bitkit://contact?pubky=pubkylockcreator');
  });

  // Bitkit rejects a link whose value carries anything outside the key, so the value is always encoded.
  it('encodes the pubky', () => {
    expect(generateBitkitContactDeeplink('key&other=value')).toBe('bitkit://contact?pubky=key%26other%3Dvalue');
  });
});

describe('toBitkitIosAuthUrl', () => {
  it('opens the same grant in Bitkit without changing query order or encoding', () => {
    const query =
      'caps=%2Fpub%2Fpubky.app%2F%3Arw%2C%2Fpriv%2Fsocial%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key&label=a+b%20c&label=%2f';

    expect(toBitkitIosAuthUrl(`pubkyauth://signin_grant?${query}`)).toBe(`bitkit://pubky-auth/signin?${query}`);
  });

  it.each([
    ['legacy Ring sign-in', 'pubkyauth://signin?caps=x&secret=s'],
    ['sign-up', 'pubkyauth://signup?invite=test'],
    ['grant without a query', 'pubkyauth://signin_grant'],
    ['grant with an empty query', 'pubkyauth://signin_grant?'],
    ['web link', 'https://pubky.app/?secret=s'],
    ['Bitkit link', 'bitkit://pubky-auth/signin?caps=x&secret=s'],
    ['empty URL', ''],
  ])('leaves a %s unchanged', (_, url) => {
    expect(toBitkitIosAuthUrl(url)).toBe(url);
  });
});
