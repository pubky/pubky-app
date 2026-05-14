import { describe, expect, it } from 'vitest';
import { GenerateDeeplinkOptions, generatePubkyRingDeeplink } from './deeplink';

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
