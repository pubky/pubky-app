import { describe, expect, it } from 'vitest';
import { calculatePasswordStrength } from './password';

describe('Password Utilities', () => {
  describe('calculatePasswordStrength', () => {
    it('should return strength 0 for empty password', () => {
      const result = calculatePasswordStrength('');
      expect(result.strength).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.checks).toEqual({
        length: false,
        lowercase: false,
        uppercase: false,
        numbers: false,
        symbols: false,
      });
    });

    it('should calculate strength correctly for weak password (only lowercase, no length)', () => {
      const result = calculatePasswordStrength('short');
      expect(result.strength).toBe(1);
      expect(result.checks.length).toBe(false);
      expect(result.checks.lowercase).toBe(true);
    });

    it('should calculate strength correctly for password with length and lowercase', () => {
      const result = calculatePasswordStrength('password');
      expect(result.strength).toBe(2);
      expect(result.checks.length).toBe(true);
      expect(result.checks.lowercase).toBe(true);
      expect(result.percentage).toBe(40);
    });

    it('should calculate strength correctly for password with length, lowercase, and uppercase', () => {
      const result = calculatePasswordStrength('Password');
      expect(result.strength).toBe(3);
      expect(result.checks.length).toBe(true);
      expect(result.checks.lowercase).toBe(true);
      expect(result.checks.uppercase).toBe(true);
    });

    it('should calculate strength correctly for password with length, lowercase, uppercase, and numbers', () => {
      const result = calculatePasswordStrength('Password1');
      expect(result.strength).toBe(4);
      expect(result.checks.length).toBe(true);
      expect(result.checks.lowercase).toBe(true);
      expect(result.checks.uppercase).toBe(true);
      expect(result.checks.numbers).toBe(true);
    });

    it('should calculate strength correctly for password with all requirements except symbols', () => {
      const result = calculatePasswordStrength('Password1');
      expect(result.strength).toBe(4);
      expect(result.checks.symbols).toBe(false);
    });

    it('should calculate strength correctly for strong password with all requirements', () => {
      const result = calculatePasswordStrength('Password1!');
      expect(result.strength).toBe(5);
      expect(result.percentage).toBe(100);
      expect(result.checks).toEqual({
        length: true,
        lowercase: true,
        uppercase: true,
        numbers: true,
        symbols: true,
      });
    });

    it('should detect symbols correctly', () => {
      const symbols = '!@#$%^&*()_+-=[]{};\':"\\|,.<>/?';
      symbols.split('').forEach((symbol) => {
        const result = calculatePasswordStrength(`Password1${symbol}`);
        expect(result.checks.symbols).toBe(true);
      });
    });

    it('should calculate percentage correctly', () => {
      expect(calculatePasswordStrength('').percentage).toBe(0);
      expect(calculatePasswordStrength('password').percentage).toBe(40);
      expect(calculatePasswordStrength('Password').percentage).toBe(60);
      expect(calculatePasswordStrength('Password1').percentage).toBe(80);
      expect(calculatePasswordStrength('Password1!').percentage).toBe(100);
    });

    it('should handle very long passwords', () => {
      const longPassword = 'a'.repeat(100) + 'A1!';
      const result = calculatePasswordStrength(longPassword);
      expect(result.strength).toBe(5);
      expect(result.checks.length).toBe(true);
    });

    it('should rate long passphrases as strong (passphrase-first security)', () => {
      const result = calculatePasswordStrength('logic finite eager ratio');
      expect(result.strength).toBe(5);
      expect(result.percentage).toBe(100);
      expect(result.checks.length).toBe(true);
    });

    it('should rate 20–23 char passphrases as good', () => {
      const result = calculatePasswordStrength('mergers decade labeled');
      expect(result.strength).toBe(4);
      expect(result.percentage).toBe(80);
    });

    it('should rate 16–19 char passphrases as fair', () => {
      const result = calculatePasswordStrength('four word pass x');
      expect(result.strength).toBe(3);
    });

    it('should treat long letter-only string without spaces as passphrase', () => {
      const result = calculatePasswordStrength('mergersdecadelabeledmanager');
      expect(result.strength).toBe(5);
    });

    it('should not treat short multi-word string as passphrase', () => {
      const result = calculatePasswordStrength('word word');
      expect(result.strength).toBe(2);
      expect(result.checks.length).toBe(true);
      expect(result.checks.lowercase).toBe(true);
    });

    it('should handle passwords with only numbers', () => {
      const result = calculatePasswordStrength('12345678');
      expect(result.strength).toBe(2);
      expect(result.checks.length).toBe(true);
      expect(result.checks.numbers).toBe(true);
    });

    it('should handle passwords with only symbols', () => {
      const result = calculatePasswordStrength('!!!!!!!!');
      expect(result.strength).toBe(2);
      expect(result.checks.length).toBe(true);
      expect(result.checks.symbols).toBe(true);
    });

    it('should handle passwords with only uppercase', () => {
      const result = calculatePasswordStrength('PASSWORD');
      expect(result.strength).toBe(2);
      expect(result.checks.length).toBe(true);
      expect(result.checks.uppercase).toBe(true);
    });

    it('should handle passwords with special unicode characters', () => {
      const result = calculatePasswordStrength('Password1€');
      expect(result.strength).toBe(4);
      expect(result.checks.symbols).toBe(false); // Unicode symbol not in regex
    });
  });
});
