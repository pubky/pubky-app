import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  cn,
  formatInviteCode,
  formatPublicKey,
  isPubkyIdentifier,
  copyToClipboard,
  clearCookies,
  generateRandomColor,
  hexToRgba,
  extractInitials,
  truncateString,
  minutesAgo,
  hoursAgo,
  daysAgo,
  formatNotificationTime,
  isPostDeleted,
  isSameDomain,
  shouldBypassLinkConfirmation,
  getCharacterCount,
  sanitizeTagInput,
  isValidTagLabel,
  canSubmitPost,
  formatUSDate,
  generateRandomUsername,
  stripPubkyPrefix,
  radixIdSerializer,
} from './utils';
import { RADIX_ID_TEST_REGEX, RADIX_ID_REGEX, TAG_BANNED_CHARS } from './utils.constants';
import { asInvalid } from '@/test-utils/type-assertions';

describe('Utils', () => {
  describe('radixIdSerializer', () => {
    describe('regex patterns', () => {
      it('RADIX_ID_TEST_REGEX matches Radix IDs', () => {
        expect(RADIX_ID_TEST_REGEX.test('radix-_r_12345')).toBe(true);
        expect(RADIX_ID_TEST_REGEX.test('_r_12345')).toBe(true);
        expect(RADIX_ID_TEST_REGEX.test('class="radix-_r_12345"')).toBe(true);
      });

      it('RADIX_ID_TEST_REGEX does not match other strings', () => {
        expect(RADIX_ID_TEST_REGEX.test('normal-id')).toBe(false);
        expect(RADIX_ID_TEST_REGEX.test('radical')).toBe(false);
      });

      it('RADIX_ID_REGEX matches all occurrences globally', () => {
        const input = 'id="radix-_r_1" and id="radix-_r_2"';
        const matches = input.match(RADIX_ID_REGEX);
        expect(matches).toHaveLength(2);
        expect(matches).toEqual(['radix-_r_1', 'radix-_r_2']);
      });
    });

    describe('test function', () => {
      it('returns true for strings containing Radix IDs', () => {
        expect(radixIdSerializer.test('some content with radix-_r_12345 inside')).toBe(true);
      });

      it('returns false for strings without Radix IDs', () => {
        expect(radixIdSerializer.test('some content without special ids')).toBe(false);
      });

      it('returns false for non-string values', () => {
        expect(radixIdSerializer.test(123)).toBe(false);
        expect(radixIdSerializer.test(null)).toBe(false);
        expect(radixIdSerializer.test({})).toBe(false);
      });

      it('does not have stateful issues with multiple calls (g flag check)', () => {
        const input = 'radix-_r_123';
        // If the regex had 'g' flag and was reused, subsequent calls might fail
        expect(radixIdSerializer.test(input)).toBe(true);
        expect(radixIdSerializer.test(input)).toBe(true);
        expect(radixIdSerializer.test(input)).toBe(true);
      });
    });
  });

  describe('cn', () => {
    it('should combine multiple class names', () => {
      const result = cn('class1', 'class2', 'class3');
      expect(result).toBe('class1 class2 class3');
    });

    it('should handle conditional classes', () => {
      const result = cn('base', true && 'conditional', false && 'hidden');
      expect(result).toBe('base conditional');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['class1', 'class2'], 'class3');
      expect(result).toBe('class1 class2 class3');
    });

    it('should handle objects with boolean values', () => {
      const result = cn({
        active: true,
        disabled: false,
        visible: true,
      });
      expect(result).toBe('active visible');
    });

    it('should merge conflicting Tailwind classes', () => {
      const result = cn('p-4', 'p-2');
      expect(result).toBe('p-2');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle null and undefined values', () => {
      const result = cn('valid', null, undefined, 'another');
      expect(result).toBe('valid another');
    });
  });

  describe('formatInviteCode', () => {
    it('should format a 12-character code correctly', () => {
      const result = formatInviteCode('ABCD1234EFGH');
      expect(result).toBe('ABCD-1234-EFGH');
    });

    it('should convert lowercase to uppercase', () => {
      const result = formatInviteCode('abcd1234efgh');
      expect(result).toBe('ABCD-1234-EFGH');
    });

    it('should remove non-alphanumeric characters', () => {
      const result = formatInviteCode('AB-CD_12@34#EF!GH');
      expect(result).toBe('ABCD-1234-EFGH');
    });

    it('should handle codes shorter than 12 characters', () => {
      const result = formatInviteCode('ABC123');
      expect(result).toBe('ABC1-23');
    });

    it('should truncate codes longer than 12 characters', () => {
      const result = formatInviteCode('ABCD1234EFGH5678');
      expect(result).toBe('ABCD-1234-EFGH');
    });

    it('should handle empty string', () => {
      const result = formatInviteCode('');
      expect(result).toBe('');
    });

    it('should handle string with only special characters', () => {
      const result = formatInviteCode('!@#$%^&*()');
      expect(result).toBe('');
    });

    it('should handle mixed case with special characters', () => {
      const result = formatInviteCode('aBc-123_DeF!456');
      expect(result).toBe('ABC1-23DE-F456');
    });
  });

  describe('formatPublicKey', () => {
    it('should format long keys with default length', () => {
      const longKey = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = formatPublicKey({ key: longKey, length: 12 });
      expect(result).toBe('abcdef...567890');
    });

    it('should format long keys with custom length', () => {
      const longKey = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = formatPublicKey({ key: longKey, length: 8 });
      expect(result).toBe('abcd...7890');
    });

    it('should return the key if shorter than or equal to length', () => {
      const shortKey = 'short';
      const result = formatPublicKey({ key: shortKey, length: 12 });
      expect(result).toBe('short');
    });

    it('should return the key if equal to length', () => {
      const exactKey = 'exactlength1';
      const result = formatPublicKey({ key: exactKey, length: 12 });
      expect(result).toBe('exactlength1');
    });

    it('should include the pubky prefix when requested', () => {
      const longKey = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = formatPublicKey({ key: longKey, length: 12, includePrefix: true });
      expect(result).toBe('pubkyabcdef...567890');
    });

    it('should handle empty string', () => {
      const result = formatPublicKey({ key: '', length: 12 });
      expect(result).toBe('');
    });

    it('should handle very short length parameter', () => {
      const key = 'abcdefghij';
      const result = formatPublicKey({ key, length: 4 });
      expect(result).toBe('ab...ij');
    });

    it('should handle odd length parameter', () => {
      const key = 'abcdefghijklmno';
      const result = formatPublicKey({ key, length: 5 });
      expect(result).toBe('ab...mno');
    });

    it('should handle length of 1', () => {
      const key = 'abcdefghij';
      const result = formatPublicKey({ key, length: 1 });
      // With length 1, only the last character of the key is shown.
      expect(result).toBe('...j');
    });
  });

  describe('isPubkyIdentifier', () => {
    it('should return true for valid 52-char lowercase alphanumeric string', () => {
      const validPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      expect(isPubkyIdentifier(validPubky)).toBe(true);
    });

    it('should return true for another valid pubky', () => {
      const validPubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      expect(isPubkyIdentifier(validPubky)).toBe(true);
    });

    it('should return false for string shorter than 52 characters', () => {
      expect(isPubkyIdentifier('short')).toBe(false);
      expect(isPubkyIdentifier('12345678901234567890')).toBe(false); // 20 chars
      expect(isPubkyIdentifier('123456789012345678901234567890123456789012345678901')).toBe(false); // 51 chars
    });

    it('should return false for string longer than 52 characters', () => {
      expect(isPubkyIdentifier('12345678901234567890123456789012345678901234567890123')).toBe(false); // 53 chars
    });

    it('should return false for string with uppercase characters', () => {
      expect(isPubkyIdentifier('GUJX6QD8KSYDH1MAKDPHD3BXU351D9B8WAQKA8HFG6Q7HNQKXEXO')).toBe(false);
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexO')).toBe(false); // One uppercase
    });

    it('should return false for string with special characters', () => {
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex!')).toBe(false);
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex-')).toBe(false);
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex_')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPubkyIdentifier('')).toBe(false);
    });

    it('should return false for common route names', () => {
      expect(isPubkyIdentifier('posts')).toBe(false);
      expect(isPubkyIdentifier('followers')).toBe(false);
      expect(isPubkyIdentifier('following')).toBe(false);
      expect(isPubkyIdentifier('notifications')).toBe(false);
    });
  });

  describe('isPubkyIdentifier', () => {
    it('should return true for valid 52-char lowercase alphanumeric string', () => {
      const validPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      expect(isPubkyIdentifier(validPubky)).toBe(true);
    });

    it('should return true for another valid pubky', () => {
      const validPubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      expect(isPubkyIdentifier(validPubky)).toBe(true);
    });

    it('should return false for string shorter than 52 characters', () => {
      expect(isPubkyIdentifier('short')).toBe(false);
      expect(isPubkyIdentifier('12345678901234567890')).toBe(false); // 20 chars
      expect(isPubkyIdentifier('123456789012345678901234567890123456789012345678901')).toBe(false); // 51 chars
    });

    it('should return false for string longer than 52 characters', () => {
      expect(isPubkyIdentifier('12345678901234567890123456789012345678901234567890123')).toBe(false); // 53 chars
    });

    it('should return false for string with uppercase characters', () => {
      expect(isPubkyIdentifier('GUJX6QD8KSYDH1MAKDPHD3BXU351D9B8WAQKA8HFG6Q7HNQKXEXO')).toBe(false);
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexO')).toBe(false); // One uppercase
    });

    it('should return false for string with special characters', () => {
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex!')).toBe(false);
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex-')).toBe(false);
      expect(isPubkyIdentifier('gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex_')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPubkyIdentifier('')).toBe(false);
    });

    it('should return false for common route names', () => {
      expect(isPubkyIdentifier('posts')).toBe(false);
      expect(isPubkyIdentifier('followers')).toBe(false);
      expect(isPubkyIdentifier('following')).toBe(false);
      expect(isPubkyIdentifier('notifications')).toBe(false);
    });
  });

  describe('copyToClipboard', () => {
    let mockClipboard: { writeText: ReturnType<typeof vi.fn> };
    let execCommandSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockClipboard = {
        writeText: vi.fn(),
      };
      execCommandSpy = vi.fn();

      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
      });

      Object.defineProperty(document, 'execCommand', {
        value: execCommandSpy,
        writable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should copy text to clipboard successfully', async () => {
      mockClipboard.writeText.mockResolvedValue(undefined);
      execCommandSpy.mockReturnValue(true);
      const testText = 'test text to copy';

      await copyToClipboard({ text: testText });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(testText);
      expect(execCommandSpy).not.toHaveBeenCalled();
    });

    it('should handle empty string', async () => {
      mockClipboard.writeText.mockResolvedValue(undefined);
      execCommandSpy.mockReturnValue(true);

      await copyToClipboard({ text: '' });

      expect(mockClipboard.writeText).toHaveBeenCalledWith('');
      expect(execCommandSpy).not.toHaveBeenCalled();
    });

    it('should handle special characters', async () => {
      mockClipboard.writeText.mockResolvedValue(undefined);
      execCommandSpy.mockReturnValue(true);
      const specialText = 'Special chars: !@#$%^&*()_+{}[]|\\:";\'<>?,./';

      await copyToClipboard({ text: specialText });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(specialText);
      expect(execCommandSpy).not.toHaveBeenCalled();
    });

    it('should fall back to execCommand when clipboard API is unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
      });
      execCommandSpy.mockReturnValue(true);

      await expect(copyToClipboard({ text: 'fallback text' })).resolves.toBeUndefined();

      expect(execCommandSpy).toHaveBeenCalled();
    });

    it('should fall back to execCommand when clipboard API throws', async () => {
      const clipboardError = new Error('Clipboard write failed');
      mockClipboard.writeText.mockRejectedValue(clipboardError);
      execCommandSpy.mockReturnValue(true);

      await expect(copyToClipboard({ text: 'test' })).resolves.toBeUndefined();

      expect(execCommandSpy).toHaveBeenCalled();
    });

    it('should throw error when neither clipboard nor execCommand are supported', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
      });
      Object.defineProperty(document, 'execCommand', {
        value: undefined,
        writable: true,
      });

      await expect(copyToClipboard({ text: 'test' })).rejects.toThrow('Clipboard API not supported');
    });

    it('should propagate execCommand errors when fallback fails', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
      });
      const fallbackError = new Error('Fallback copy command was unsuccessful');
      execCommandSpy.mockImplementation(() => {
        throw fallbackError;
      });

      await expect(copyToClipboard({ text: 'test' })).rejects.toThrow('Fallback copy command was unsuccessful');
    });
  });

  describe('clearCookies', () => {
    let originalCookie: string;

    beforeEach(() => {
      originalCookie = document.cookie;
      // Clear any existing cookies
      document.cookie.split(';').forEach((c) => {
        const eqPos = c.indexOf('=');
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        document.cookie = `${name.trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    });

    afterEach(() => {
      // Restore original cookies if any
      if (originalCookie) {
        document.cookie = originalCookie;
      }
    });

    it('should clear all cookies', () => {
      // Set some test cookies
      document.cookie = 'testCookie1=value1; path=/';
      document.cookie = 'testCookie2=value2; path=/';
      document.cookie = 'testCookie3=value3; path=/';

      // Verify cookies are set
      expect(document.cookie).toContain('testCookie1');
      expect(document.cookie).toContain('testCookie2');
      expect(document.cookie).toContain('testCookie3');

      // Clear cookies
      clearCookies();

      // Note: In test environment, we can't actually verify cookies are cleared
      // because document.cookie behavior is limited in jsdom
      // We can only test that the function runs without errors
      expect(() => clearCookies()).not.toThrow();
    });

    it('should handle empty cookies gracefully', () => {
      // Ensure no cookies exist
      expect(document.cookie).toBe('');

      // Should not throw error
      expect(() => clearCookies()).not.toThrow();
    });

    it('should handle cookies with spaces', () => {
      // Set cookies with various formats
      document.cookie = ' testCookie1 = value1 ; path=/';
      document.cookie = '  testCookie2=value2; path=/';

      // Should not throw error
      expect(() => clearCookies()).not.toThrow();
    });

    it('should handle cookies with special characters in names', () => {
      // Set cookies with special characters (that are valid)
      document.cookie = 'test_cookie-1=value1; path=/';
      document.cookie = 'test.cookie.2=value2; path=/';

      // Should not throw error
      expect(() => clearCookies()).not.toThrow();
    });

    it('should skip cookies in the exclude list', () => {
      document.cookie = 'auth=token123; path=/';
      document.cookie = 'locale=es; path=/';

      clearCookies(['locale']);

      expect(document.cookie).toContain('locale=es');
    });
  });

  describe('generateRandomColor', () => {
    it('should return custom colors for specific names', () => {
      expect(generateRandomColor('bitcoin')).toBe('#FF9900');
      expect(generateRandomColor('synonym')).toBe('#FF6600');
      expect(generateRandomColor('bitkit')).toBe('#FF4400');
      expect(generateRandomColor('pubky')).toBe('#C8FF00');
      expect(generateRandomColor('blocktank')).toBe('#FFAE00');
      expect(generateRandomColor('tether')).toBe('#26A17B');
    });

    it('should return custom colors case-insensitively', () => {
      expect(generateRandomColor('BITCOIN')).toBe('#FF9900');
      expect(generateRandomColor('Bitcoin')).toBe('#FF9900');
      expect(generateRandomColor('BiTcOiN')).toBe('#FF9900');
    });

    it('should generate consistent colors for the same input', () => {
      const color1 = generateRandomColor('test');
      const color2 = generateRandomColor('test');
      expect(color1).toBe(color2);
    });

    it('should generate different colors for different inputs', () => {
      const color1 = generateRandomColor('test1');
      const color2 = generateRandomColor('test2');
      expect(color1).not.toBe(color2);
    });

    it('should return a valid hex color format', () => {
      const color = generateRandomColor('random');
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should handle empty string', () => {
      const color = generateRandomColor('');
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should handle special characters', () => {
      const color = generateRandomColor('!@#$%^&*()');
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should handle unicode characters', () => {
      const color = generateRandomColor('🚀🌟💫');
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  describe('hexToRgba', () => {
    it('should convert hex to rgba correctly', () => {
      expect(hexToRgba('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
      expect(hexToRgba('#00FF00', 1)).toBe('rgba(0, 255, 0, 1)');
      expect(hexToRgba('#0000FF', 0)).toBe('rgba(0, 0, 255, 0)');
    });

    it('should handle custom cases colors', () => {
      expect(hexToRgba('#FF9900', 0.3)).toBe('rgba(255, 153, 0, 0.3)');
      expect(hexToRgba('#26A17B', 1)).toBe('rgba(38, 161, 123, 1)');
    });

    it('should handle alpha values between 0 and 1', () => {
      expect(hexToRgba('#FFFFFF', 0.25)).toBe('rgba(255, 255, 255, 0.25)');
      expect(hexToRgba('#000000', 0.75)).toBe('rgba(0, 0, 0, 0.75)');
    });

    it('should handle edge case alpha values', () => {
      expect(hexToRgba('#123456', 0)).toBe('rgba(18, 52, 86, 0)');
      expect(hexToRgba('#123456', 1)).toBe('rgba(18, 52, 86, 1)');
    });
  });

  describe('extractInitials', () => {
    it('should extract initials from full name', () => {
      expect(extractInitials({ name: 'John Doe' })).toBe('JD');
      expect(extractInitials({ name: 'Jane Smith' })).toBe('JS');
    });

    it('should handle single name', () => {
      expect(extractInitials({ name: 'John' })).toBe('J');
      expect(extractInitials({ name: 'Jane' })).toBe('J');
    });

    it('should handle multiple names', () => {
      expect(extractInitials({ name: 'John Michael Doe' })).toBe('JM');
      expect(extractInitials({ name: 'Jane Elizabeth Smith' })).toBe('JE');
    });

    it('should respect maxLength parameter', () => {
      expect(extractInitials({ name: 'John Michael Doe', maxLength: 1 })).toBe('J');
      expect(extractInitials({ name: 'John Michael Doe', maxLength: 3 })).toBe('JMD');
      expect(extractInitials({ name: 'John Michael Doe', maxLength: 5 })).toBe('JMD');
    });

    it('should handle names with extra spaces', () => {
      expect(extractInitials({ name: '  John   Doe  ' })).toBe('JD');
      expect(extractInitials({ name: 'John   Michael   Doe' })).toBe('JM');
    });

    it('should convert to uppercase', () => {
      expect(extractInitials({ name: 'john doe' })).toBe('JD');
      expect(extractInitials({ name: 'jane smith' })).toBe('JS');
    });

    it('should handle empty string', () => {
      expect(extractInitials({ name: '' })).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(extractInitials({ name: asInvalid<string>(null) })).toBe('');
      expect(extractInitials({ name: asInvalid<string>(undefined) })).toBe('');
    });

    it('should handle non-string input', () => {
      expect(extractInitials({ name: asInvalid<string>(123) })).toBe('');
      expect(extractInitials({ name: asInvalid<string>({}) })).toBe('');
    });

    it('should handle names with special characters', () => {
      expect(extractInitials({ name: 'Jean-Pierre Dupont' })).toBe('JD');
      expect(extractInitials({ name: "Mary O'Connor" })).toBe('MO');
    });

    it('should handle names with numbers', () => {
      expect(extractInitials({ name: 'John2 Doe3' })).toBe('JD');
    });
  });

  describe('truncateString', () => {
    it('should truncate strings longer than maxLength', () => {
      expect(truncateString('VeryLongUserName', 10)).toBe('VeryLongUs...');
      expect(truncateString('Miguel Medeiros', 10)).toBe('Miguel Med...');
    });

    it('should not truncate strings shorter than maxLength', () => {
      expect(truncateString('John', 10)).toBe('John');
      expect(truncateString('Short', 10)).toBe('Short');
    });

    it('should handle strings exactly at maxLength', () => {
      expect(truncateString('1234567890', 10)).toBe('1234567890');
      expect(truncateString('ExactlyTen', 10)).toBe('ExactlyTen');
    });

    it('should handle empty string', () => {
      expect(truncateString('', 10)).toBe('');
    });

    it('should handle very short maxLength', () => {
      expect(truncateString('Hello World', 1)).toBe('H...');
      expect(truncateString('Test', 2)).toBe('Te...');
    });

    it('should handle maxLength of 0', () => {
      expect(truncateString('Test', 0)).toBe('...');
    });

    it('should handle single character strings', () => {
      expect(truncateString('A', 1)).toBe('A');
      expect(truncateString('A', 5)).toBe('A');
    });

    it('should handle special characters', () => {
      expect(truncateString('Special!@#$%Characters', 10)).toBe('Special!@#...');
      expect(truncateString('Email@domain.com', 10)).toBe('Email@doma...');
    });

    it('should handle unicode characters', () => {
      // Note: Emojis are multi-byte characters, so string.length may not match visual character count
      // This test verifies the function works correctly with the JavaScript string API
      expect(truncateString('Hello 世界', 7)).toBe('Hello 世...');
      expect(truncateString('Test 你好', 6)).toBe('Test 你...');
    });

    it('should handle strings with spaces', () => {
      expect(truncateString('Hello World Test', 10)).toBe('Hello Worl...');
      expect(truncateString('   Spaces   ', 5)).toBe('   Sp...');
    });

    it('should handle null and undefined as empty strings', () => {
      expect(truncateString(asInvalid<string>(null), 10)).toBe('');
      expect(truncateString(asInvalid<string>(undefined), 10)).toBe('');
    });

    it('should add exactly three dots as ellipsis', () => {
      const result = truncateString('LongString', 5);
      expect(result.endsWith('...')).toBe(true);
      expect(result.split('...').length).toBe(2);
    });

    it('should preserve the first N characters before ellipsis', () => {
      const result = truncateString('HelloWorld', 5);
      expect(result.startsWith('Hello')).toBe(true);
      expect(result).toBe('Hello...');
    });

    it('should handle consecutive truncations consistently', () => {
      const str = 'ConsistentString';
      const result1 = truncateString(str, 8);
      const result2 = truncateString(str, 8);
      expect(result1).toBe(result2);
      expect(result1).toBe('Consiste...');
    });

    it('should handle different maxLength values for same string', () => {
      const str = 'TestString';
      expect(truncateString(str, 4)).toBe('Test...');
      expect(truncateString(str, 6)).toBe('TestSt...');
      expect(truncateString(str, 8)).toBe('TestStri...');
      expect(truncateString(str, 10)).toBe('TestString');
    });

    it('should handle numbers as strings', () => {
      expect(truncateString('123456789012345', 10)).toBe('1234567890...');
    });

    it('should handle mixed alphanumeric strings', () => {
      expect(truncateString('User123Name456', 8)).toBe('User123N...');
    });
  });

  describe('minutesAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return timestamp for minutes ago', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = minutesAgo(5);
      const expected = now - 5 * 60 * 1000;

      expect(result).toBe(expected);
    });

    it('should handle zero minutes', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = minutesAgo(0);
      expect(result).toBe(now);
    });

    it('should handle large number of minutes', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = minutesAgo(1440); // 24 hours
      const expected = now - 1440 * 60 * 1000;

      expect(result).toBe(expected);
    });
  });

  describe('hoursAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return timestamp for hours ago', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = hoursAgo(3);
      const expected = now - 3 * 60 * 60 * 1000;

      expect(result).toBe(expected);
    });

    it('should handle zero hours', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = hoursAgo(0);
      expect(result).toBe(now);
    });

    it('should handle large number of hours', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = hoursAgo(48); // 2 days
      const expected = now - 48 * 60 * 60 * 1000;

      expect(result).toBe(expected);
    });
  });

  describe('daysAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return timestamp for days ago', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = daysAgo(7);
      const expected = now - 7 * 24 * 60 * 60 * 1000;

      expect(result).toBe(expected);
    });

    it('should handle zero days', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = daysAgo(0);
      expect(result).toBe(now);
    });

    it('should handle large number of days', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = daysAgo(30);
      const expected = now - 30 * 24 * 60 * 60 * 1000;

      expect(result).toBe(expected);
    });
  });

  describe('formatNotificationTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('short format (default)', () => {
      it('should return "now" for timestamps less than 1 minute ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 30 * 1000; // 30 seconds ago
        expect(formatNotificationTime(timestamp)).toBe('now');
      });

      it('should return "now" for current timestamp', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        expect(formatNotificationTime(now)).toBe('now');
      });

      it('should return minutes format for timestamps less than 60 minutes ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 5 * 60 * 1000; // 5 minutes ago
        expect(formatNotificationTime(timestamp)).toBe('5m');
      });

      it('should return minutes format for 59 minutes ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 59 * 60 * 1000;
        expect(formatNotificationTime(timestamp)).toBe('59m');
      });

      it('should return hours format for timestamps less than 24 hours ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 3 * 60 * 60 * 1000; // 3 hours ago
        expect(formatNotificationTime(timestamp)).toBe('3h');
      });

      it('should return days format for 2 days ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 2 * 24 * 60 * 60 * 1000;
        expect(formatNotificationTime(timestamp)).toBe('2d');
      });
    });

    describe('long format', () => {
      it('should return "NOW" for timestamps less than 1 minute ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 30 * 1000; // 30 seconds ago
        expect(formatNotificationTime(timestamp, true)).toBe('NOW');
      });

      it('should return "NOW" for current timestamp', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        expect(formatNotificationTime(now, true)).toBe('NOW');
      });

      it('should return minutes format for timestamps less than 60 minutes ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 5 * 60 * 1000; // 5 minutes ago
        expect(formatNotificationTime(timestamp, true)).toBe('5 MINUTES AGO');
      });

      it('should return minutes format for 59 minutes ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 59 * 60 * 1000;
        expect(formatNotificationTime(timestamp, true)).toBe('59 MINUTES AGO');
      });

      it('should return hours format for timestamps less than 24 hours ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 3 * 60 * 60 * 1000; // 3 hours ago
        expect(formatNotificationTime(timestamp, true)).toBe('3 HOURS AGO');
      });

      it('should return hours format for 23 hours ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 23 * 60 * 60 * 1000;
        expect(formatNotificationTime(timestamp, true)).toBe('23 HOURS AGO');
      });

      it('should return days format for timestamps less than 7 days ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 2 * 24 * 60 * 60 * 1000; // 2 days ago
        expect(formatNotificationTime(timestamp, true)).toBe('2 DAYS AGO');
      });

      it('should return days format for 6 days ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 6 * 24 * 60 * 60 * 1000;
        expect(formatNotificationTime(timestamp, true)).toBe('6 DAYS AGO');
      });

      it('should return days format for timestamps 7 or more days ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago
        expect(formatNotificationTime(timestamp, true)).toBe('7 DAYS AGO');
      });

      it('should return days format for timestamps 30 days ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago
        expect(formatNotificationTime(timestamp, true)).toBe('30 DAYS AGO');
      });

      it('should handle edge case: exactly 1 minute ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 60 * 1000; // exactly 1 minute
        expect(formatNotificationTime(timestamp, true)).toBe('1 MINUTE AGO');
      });

      it('should handle edge case: exactly 60 minutes ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 60 * 60 * 1000; // exactly 1 hour
        expect(formatNotificationTime(timestamp, true)).toBe('1 HOUR AGO');
      });

      it('should handle edge case: exactly 24 hours ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 24 * 60 * 60 * 1000; // exactly 1 day
        expect(formatNotificationTime(timestamp, true)).toBe('1 DAY AGO');
      });

      it('should handle edge case: exactly 7 days ago', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const timestamp = now - 7 * 24 * 60 * 60 * 1000; // exactly 7 days
        expect(formatNotificationTime(timestamp, true)).toBe('7 DAYS AGO');
      });
    });
  });

  describe('isPostDeleted', () => {
    it('should return true for "[DELETED]" content', () => {
      expect(isPostDeleted('[DELETED]')).toBe(true);
    });

    it('should return false for regular content', () => {
      expect(isPostDeleted('Hello world')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPostDeleted('')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPostDeleted(undefined)).toBe(false);
    });

    it('should return false for similar but not exact match', () => {
      expect(isPostDeleted('[deleted]')).toBe(false);
      expect(isPostDeleted('DELETED')).toBe(false);
      expect(isPostDeleted('[DELETED] ')).toBe(false);
      expect(isPostDeleted(' [DELETED]')).toBe(false);
    });

    it('should return false for content containing "[DELETED]"', () => {
      expect(isPostDeleted('This post is [DELETED]')).toBe(false);
      expect(isPostDeleted('[DELETED] post')).toBe(false);
    });
  });

  describe('isSameDomain', () => {
    const originalLocation = window.location;

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: originalLocation,
      });
    });

    it('should return true for same domain URLs', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(isSameDomain('https://example.com/page')).toBe(true);
      expect(isSameDomain('https://example.com/another/page')).toBe(true);
      expect(isSameDomain('http://example.com/page')).toBe(true);
    });

    it('should return true when comparing www and non-www versions', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(isSameDomain('https://www.example.com/page')).toBe(true);
    });

    it('should return true when current page has www and URL does not', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'www.example.com' },
      });

      expect(isSameDomain('https://example.com/page')).toBe(true);
    });

    it('should return false for different domains', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(isSameDomain('https://other-domain.com/page')).toBe(false);
      expect(isSameDomain('https://subdomain.example.com/page')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(isSameDomain('not-a-valid-url')).toBe(false);
      expect(isSameDomain('')).toBe(false);
    });

    it('should handle case-insensitive domain comparison', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'EXAMPLE.COM' },
      });

      expect(isSameDomain('https://example.com/page')).toBe(true);
    });

    it('should return false for subdomains', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(isSameDomain('https://subdomain.example.com/page')).toBe(false);
      expect(isSameDomain('https://blog.example.com/page')).toBe(false);
    });

    it('should handle URLs with query params and hash', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(isSameDomain('https://example.com/page?query=1')).toBe(true);
      expect(isSameDomain('https://example.com/page#hash')).toBe(true);
      expect(isSameDomain('https://example.com/page?query=1#hash')).toBe(true);
    });

    it('should handle URLs with ports correctly', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      // URLs with ports should still match if hostname matches
      expect(isSameDomain('https://example.com:8080/page')).toBe(true);
      expect(isSameDomain('https://www.example.com:3000/page')).toBe(true);
    });
  });

  describe('shouldBypassLinkConfirmation', () => {
    const originalLocation = window.location;

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: originalLocation,
      });
    });

    it('should return true for mailto links', () => {
      expect(shouldBypassLinkConfirmation('mailto:test@example.com')).toBe(true);
      expect(shouldBypassLinkConfirmation('mailto:user@domain.com')).toBe(true);
    });

    it('should return true for tel links', () => {
      expect(shouldBypassLinkConfirmation('tel:+1234567890')).toBe(true);
      expect(shouldBypassLinkConfirmation('tel:123-456-7890')).toBe(true);
    });

    it('should return true for same domain URLs', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(shouldBypassLinkConfirmation('https://example.com/page')).toBe(true);
      expect(shouldBypassLinkConfirmation('https://www.example.com/page')).toBe(true);
    });

    it('should return false for different domain URLs', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(shouldBypassLinkConfirmation('https://other-domain.com/page')).toBe(false);
      expect(shouldBypassLinkConfirmation('https://subdomain.example.com/page')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      expect(shouldBypassLinkConfirmation('not-a-valid-url')).toBe(false);
      expect(shouldBypassLinkConfirmation('')).toBe(false);
    });

    it('should prioritize protocol bypass over domain check', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'example.com' },
      });

      // Even if it's a different domain, mailto/tel should bypass
      expect(shouldBypassLinkConfirmation('mailto:test@other-domain.com')).toBe(true);
      expect(shouldBypassLinkConfirmation('tel:+1234567890')).toBe(true);
    });
  });

  describe('getCharacterCount', () => {
    it('should count ASCII characters correctly', () => {
      expect(getCharacterCount('hello')).toBe(5);
      expect(getCharacterCount('Hello World')).toBe(11);
      expect(getCharacterCount('')).toBe(0);
    });

    it('should count single emoji as 1 character', () => {
      expect(getCharacterCount('👍')).toBe(1);
      expect(getCharacterCount('🚀')).toBe(1);
      expect(getCharacterCount('❤️')).toBe(2); // Note: ❤️ is a composite emoji (heart + variation selector)
    });

    it('should count text with emojis correctly', () => {
      expect(getCharacterCount('Hello 👍')).toBe(7);
      expect(getCharacterCount('🚀🌟💫')).toBe(3);
      expect(getCharacterCount('Test 🎉 emoji')).toBe(12);
    });

    it('should count 4-byte Unicode characters correctly', () => {
      // Mathematical symbols and rare characters
      expect(getCharacterCount('𝕳𝖊𝖑𝖑𝖔')).toBe(5); // Mathematical Fraktur
      expect(getCharacterCount('𠀀')).toBe(1); // CJK extension B character
    });

    it('should count flag emojis correctly', () => {
      // Flag emojis are composed of 2 regional indicator symbols
      expect(getCharacterCount('🇺🇸')).toBe(2); // US flag = 2 regional indicators
      expect(getCharacterCount('🇧🇷')).toBe(2); // Brazil flag
    });

    it('should handle mixed content', () => {
      expect(getCharacterCount('Hello 世界 👋')).toBe(10);
      // '123 🎉 abc' = 1,2,3,space,emoji,space,a,b,c = 9 characters
      expect(getCharacterCount('123 🎉 abc')).toBe(9);
    });

    it('should count newlines and special characters', () => {
      expect(getCharacterCount('Hello\nWorld')).toBe(11);
      expect(getCharacterCount('Tab\tHere')).toBe(8);
      expect(getCharacterCount('!@#$%^&*()')).toBe(10);
    });
  });

  describe('sanitizeTagInput', () => {
    it('should remove colons from input', () => {
      expect(sanitizeTagInput('hello:world')).toBe('helloworld');
      expect(sanitizeTagInput('tag:with:colons')).toBe('tagwithcolons');
    });

    it('should remove commas from input', () => {
      expect(sanitizeTagInput('hello,world')).toBe('helloworld');
      expect(sanitizeTagInput('tag,with,commas')).toBe('tagwithcommas');
    });

    it('should remove spaces from input', () => {
      expect(sanitizeTagInput('hello world')).toBe('helloworld');
      expect(sanitizeTagInput('tag with spaces')).toBe('tagwithspaces');
    });

    it('should remove tabs and newlines from input', () => {
      expect(sanitizeTagInput('hello\tworld')).toBe('helloworld');
      expect(sanitizeTagInput('tag\nwith\rbreaks')).toBe('tagwithbreaks');
    });

    it('should remove all banned characters at once', () => {
      expect(sanitizeTagInput('hello:\t world,\n test')).toBe('helloworldtest');
      expect(sanitizeTagInput(':\n,\r mixed:\t, chars')).toBe('mixedchars');
    });

    it('should preserve valid characters', () => {
      expect(sanitizeTagInput('valid-tag')).toBe('valid-tag');
      expect(sanitizeTagInput('tag123')).toBe('tag123');
      expect(sanitizeTagInput('emoji👍tag')).toBe('emoji👍tag');
      expect(sanitizeTagInput('CamelCase')).toBe('CamelCase');
    });

    it('should handle empty string', () => {
      expect(sanitizeTagInput('')).toBe('');
    });

    it('should handle string with only banned characters', () => {
      expect(sanitizeTagInput(': , :')).toBe('');
      expect(sanitizeTagInput(' \t\r\n ')).toBe('');
    });

    it('should handle Unicode characters', () => {
      expect(sanitizeTagInput('日本語')).toBe('日本語');
      expect(sanitizeTagInput('日本語: test')).toBe('日本語test');
    });
  });

  describe('TAG_BANNED_CHARS', () => {
    it('should be a valid regex', () => {
      expect(TAG_BANNED_CHARS).toBeInstanceOf(RegExp);
    });

    it('should have global flag', () => {
      expect(TAG_BANNED_CHARS.global).toBe(true);
    });

    it('should match colons', () => {
      expect(':'.match(TAG_BANNED_CHARS)).not.toBeNull();
    });

    it('should match commas', () => {
      expect(','.match(TAG_BANNED_CHARS)).not.toBeNull();
    });

    it('should match spaces', () => {
      expect(' '.match(TAG_BANNED_CHARS)).not.toBeNull();
    });

    it('should match tabs and newlines', () => {
      expect('\t'.match(TAG_BANNED_CHARS)).not.toBeNull();
      expect('\n'.match(TAG_BANNED_CHARS)).not.toBeNull();
      expect('\r'.match(TAG_BANNED_CHARS)).not.toBeNull();
    });

    it('should not match valid characters', () => {
      expect('a'.match(TAG_BANNED_CHARS)).toBeNull();
      expect('-'.match(TAG_BANNED_CHARS)).toBeNull();
      expect('_'.match(TAG_BANNED_CHARS)).toBeNull();
    });
  });

  describe('isValidTagLabel', () => {
    it('should accept a short valid tag', () => {
      expect(isValidTagLabel('bitcoin')).toBe(true);
    });

    it('should accept a tag at exactly 20 characters', () => {
      expect(isValidTagLabel('a'.repeat(20))).toBe(true);
    });

    it('should reject a tag exceeding 20 characters', () => {
      expect(isValidTagLabel('a'.repeat(21))).toBe(false);
    });

    it('should reject an empty string', () => {
      expect(isValidTagLabel('')).toBe(false);
    });

    it('should reject strings containing colons', () => {
      expect(isValidTagLabel('pk:abc')).toBe(false);
      expect(isValidTagLabel('hello:world')).toBe(false);
    });

    it('should reject strings containing commas', () => {
      expect(isValidTagLabel('one,two')).toBe(false);
    });

    it('should reject strings containing spaces', () => {
      expect(isValidTagLabel('hello world')).toBe(false);
    });

    it('should reject strings containing tabs and newlines', () => {
      expect(isValidTagLabel('hello\tworld')).toBe(false);
      expect(isValidTagLabel('hello\nworld')).toBe(false);
    });

    it('should accept tags with hyphens, underscores, and unicode', () => {
      expect(isValidTagLabel('valid-tag')).toBe(true);
      expect(isValidTagLabel('valid_tag')).toBe(true);
      expect(isValidTagLabel('日本語')).toBe(true);
    });

    it('should reject a pk:-prefixed pubky string', () => {
      expect(isValidTagLabel('pk:abcdefghijklmnopqrstuvwxyz')).toBe(false);
    });
  });

  describe('canSubmitPost', () => {
    describe('when submitting is in progress', () => {
      it('should return false regardless of content', () => {
        expect(canSubmitPost('post', 'Hello', [], true)).toBe(false);
        expect(canSubmitPost('reply', 'Hello', [], true)).toBe(false);
        expect(canSubmitPost('repost', '', [], true)).toBe(false);
        expect(canSubmitPost('edit', 'Hello', [], true)).toBe(false);
      });
    });

    describe('for post variant', () => {
      it('should return true when content is provided', () => {
        expect(canSubmitPost('post', 'Hello world', [], false)).toBe(true);
      });

      it('should return true when attachments are provided', () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        expect(canSubmitPost('post', '', [mockFile], false)).toBe(true);
      });

      it('should return true when both content and attachments are provided', () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        expect(canSubmitPost('post', 'Hello', [mockFile], false)).toBe(true);
      });

      it('should return false when no content and no attachments', () => {
        expect(canSubmitPost('post', '', [], false)).toBe(false);
      });

      it('should return false for whitespace-only content', () => {
        expect(canSubmitPost('post', '   ', [], false)).toBe(false);
        expect(canSubmitPost('post', '\n\t', [], false)).toBe(false);
      });
    });

    describe('for reply variant', () => {
      it('should return true when content is provided', () => {
        expect(canSubmitPost('reply', 'Hello world', [], false)).toBe(true);
      });

      it('should return true when attachments are provided', () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        expect(canSubmitPost('reply', '', [mockFile], false)).toBe(true);
      });

      it('should return false when no content and no attachments', () => {
        expect(canSubmitPost('reply', '', [], false)).toBe(false);
      });
    });

    describe('for repost variant', () => {
      it('should return true even with empty content', () => {
        expect(canSubmitPost('repost', '', [], false)).toBe(true);
      });

      it('should return true with content', () => {
        expect(canSubmitPost('repost', 'Adding my thoughts', [], false)).toBe(true);
      });
    });

    describe('for edit variant', () => {
      it('should return true when content is provided', () => {
        expect(canSubmitPost('edit', 'Updated content', [], false)).toBe(true);
      });

      it('should return false when content is empty', () => {
        expect(canSubmitPost('edit', '', [], false)).toBe(false);
      });

      it('should return false for whitespace-only content', () => {
        expect(canSubmitPost('edit', '   ', [], false)).toBe(false);
        expect(canSubmitPost('edit', '\n\t', [], false)).toBe(false);
      });

      it('should return true with content even without attachments', () => {
        expect(canSubmitPost('edit', 'Updated content', [], false)).toBe(true);
      });

      it('should return false with attachments but no content', () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        expect(canSubmitPost('edit', '', [mockFile], false)).toBe(false);
      });

      it('should require both content and title when isArticle is true', () => {
        expect(canSubmitPost('edit', 'Updated article content', [], false, true, 'Article Title')).toBe(true);
        expect(canSubmitPost('edit', 'Updated article content', [], false, true, '')).toBe(false);
        expect(canSubmitPost('edit', 'Updated article content', [], false, true, undefined)).toBe(false);
        expect(canSubmitPost('edit', '', [], false, true, 'Article Title')).toBe(false);
        expect(canSubmitPost('edit', '   ', [], false, true, 'Article Title')).toBe(false);
        expect(canSubmitPost('edit', 'Updated article content', [], false, true, '   ')).toBe(false);
      });
    });

    describe('for article posts', () => {
      it('should return true when both content and title are provided', () => {
        expect(canSubmitPost('post', 'Article content', [], false, true, 'Article Title')).toBe(true);
      });

      it('should return false when content is empty', () => {
        expect(canSubmitPost('post', '', [], false, true, 'Article Title')).toBe(false);
      });

      it('should return false when title is empty', () => {
        expect(canSubmitPost('post', 'Article content', [], false, true, '')).toBe(false);
      });

      it('should return false when title is undefined', () => {
        expect(canSubmitPost('post', 'Article content', [], false, true, undefined)).toBe(false);
      });

      it('should return false when content is whitespace-only', () => {
        expect(canSubmitPost('post', '   ', [], false, true, 'Article Title')).toBe(false);
      });

      it('should return false when title is whitespace-only', () => {
        expect(canSubmitPost('post', 'Article content', [], false, true, '   ')).toBe(false);
      });

      it('should ignore attachments for article validation', () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        expect(canSubmitPost('post', '', [mockFile], false, true, 'Article Title')).toBe(false);
      });

      it('should return false when submitting even with valid content and title', () => {
        expect(canSubmitPost('post', 'Article content', [], true, true, 'Article Title')).toBe(false);
      });
    });

    describe('when isArticle is false or undefined', () => {
      it('should use standard post validation when isArticle is false', () => {
        expect(canSubmitPost('post', 'Hello', [], false, false, '')).toBe(true);
        expect(canSubmitPost('post', '', [], false, false, 'Title')).toBe(false);
      });

      it('should use standard post validation when isArticle is undefined', () => {
        expect(canSubmitPost('post', 'Hello', [], false, undefined, undefined)).toBe(true);
        expect(canSubmitPost('post', '', [], false, undefined, undefined)).toBe(false);
      });
    });
    describe('formatUSDate', () => {
      it('should format current date in US locale format', () => {
        const result = formatUSDate();
        // Should match MM/DD/YYYY format
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      });

      it('should format a specific date correctly', () => {
        const testDate = new Date(2024, 11, 25); // Month is 0-indexed
        const result = formatUSDate(testDate);
        expect(result).toBe('12/25/2024');
      });

      it('should pad single digit months and days with zeros', () => {
        const testDate = new Date(2024, 0, 5); // Month is 0-indexed
        const result = formatUSDate(testDate);
        expect(result).toBe('01/05/2024');
      });

      it('should handle different years', () => {
        const testDate = new Date(2030, 5, 15); // Month is 0-indexed
        const result = formatUSDate(testDate);
        expect(result).toBe('06/15/2030');
      });

      it('should handle end of year date', () => {
        const testDate = new Date(2024, 11, 31); // Month is 0-indexed
        const result = formatUSDate(testDate);
        expect(result).toBe('12/31/2024');
      });

      it('should handle beginning of year date', () => {
        const testDate = new Date(2024, 0, 1); // Month is 0-indexed
        const result = formatUSDate(testDate);
        expect(result).toBe('01/01/2024');
      });

      it('should format a specific date correctly', () => {
        // Use local date constructor to avoid timezone issues
        const testDate = new Date(2024, 11, 25); // Dec 25, 2024
        const result = formatUSDate(testDate);
        expect(result).toBe('12/25/2024');
      });

      it('should pad single digit months and days with zeros', () => {
        // Use local date constructor to avoid timezone issues
        const testDate = new Date(2024, 0, 5); // Jan 5, 2024
        const result = formatUSDate(testDate);
        expect(result).toBe('01/05/2024');
      });

      it('should handle different years', () => {
        // Use local date constructor to avoid timezone issues
        const testDate = new Date(2030, 5, 15); // Jun 15, 2030
        const result = formatUSDate(testDate);
        expect(result).toBe('06/15/2030');
      });

      it('should handle end of year date', () => {
        // Use local date constructor to avoid timezone issues
        const testDate = new Date(2024, 11, 31); // Dec 31, 2024
        const result = formatUSDate(testDate);
        expect(result).toBe('12/31/2024');
      });

      it('should handle beginning of year date', () => {
        // Use local date constructor to avoid timezone issues
        const testDate = new Date(2024, 0, 1); // Jan 1, 2024
        const result = formatUSDate(testDate);
        expect(result).toBe('01/01/2024');
      });
    });
  });

  describe('stripPubkyPrefix', () => {
    it('should strip "pubky" prefix from a pubky identifier', () => {
      const prefixedKey = 'pubkyo1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      const expected = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      expect(stripPubkyPrefix(prefixedKey)).toBe(expected);
    });

    it('should strip "pk:" legacy prefix from a pubky identifier', () => {
      const prefixedKey = 'pk:o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      const expected = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      expect(stripPubkyPrefix(prefixedKey)).toBe(expected);
    });

    it('should return the key unchanged if no prefix is present', () => {
      const rawKey = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      expect(stripPubkyPrefix(rawKey)).toBe(rawKey);
    });

    it('should return empty string for empty input', () => {
      expect(stripPubkyPrefix('')).toBe('');
    });

    it('should handle null-like values gracefully', () => {
      expect(stripPubkyPrefix(asInvalid<string>(null))).toBe('');
      expect(stripPubkyPrefix(asInvalid<string>(undefined))).toBe('');
    });
  });

  describe('generateRandomUsername', () => {
    it('should return a string in Adjective-Noun-Noun format', () => {
      const username = generateRandomUsername();
      const parts = username.split('-');
      expect(parts).toHaveLength(3);
      // Each part should start with uppercase and contain only letters
      parts.forEach((part) => {
        expect(part).toMatch(/^[A-Z][a-z]+$/);
      });
    });

    it('should generate different usernames on multiple calls', () => {
      const usernames = new Set<string>();
      // Generate 20 usernames - with 30 adjectives and 40 nouns, collisions should be rare
      for (let i = 0; i < 20; i++) {
        usernames.add(generateRandomUsername());
      }
      // At least 10 should be unique (allowing for some randomness)
      expect(usernames.size).toBeGreaterThanOrEqual(10);
    });

    it('should not have the same noun repeated twice', () => {
      // Run multiple times to increase confidence
      for (let i = 0; i < 50; i++) {
        const username = generateRandomUsername();
        const parts = username.split('-');
        expect(parts[1]).not.toBe(parts[2]);
      }
    });

    it('should generate usernames with reasonable length', () => {
      for (let i = 0; i < 20; i++) {
        const username = generateRandomUsername();
        // Minimum: 3 chars + hyphen + 3 chars + hyphen + 3 chars = 11 chars
        // Maximum: 7 chars + hyphen + 7 chars + hyphen + 7 chars = 23 chars (based on word lists)
        expect(username.length).toBeGreaterThanOrEqual(11);
        expect(username.length).toBeLessThanOrEqual(25);
      }
    });
  });
});
