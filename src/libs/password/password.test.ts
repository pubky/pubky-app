import { describe, expect, it } from 'vitest';
import { calculatePasswordStrength, getStrengthColor, getStrengthText } from './password';

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

  describe('getStrengthText', () => {
    it('should return empty string for strength 0', () => {
      expect(getStrengthText(0)).toBe('');
    });

    it('should return "Weak password" for strength 1', () => {
      expect(getStrengthText(1)).toBe('Weak password');
    });

    it('should return "Weak password" for strength 2', () => {
      expect(getStrengthText(2)).toBe('Weak password');
    });

    it('should return "Fair password" for strength 3', () => {
      expect(getStrengthText(3)).toBe('Fair password');
    });

    it('should return "Good password" for strength 4', () => {
      expect(getStrengthText(4)).toBe('Good password');
    });

    it('should return "Strong password!" for strength 5', () => {
      expect(getStrengthText(5)).toBe('Strong password!');
    });

    it('should return "Strong password!" for strength greater than 5', () => {
      expect(getStrengthText(6)).toBe('Strong password!');
      expect(getStrengthText(10)).toBe('Strong password!');
    });
  });

  describe('getStrengthColor', () => {
    it('should return "text-red-400" for strength 0', () => {
      expect(getStrengthColor(0)).toBe('text-red-400');
    });

    it('should return "text-red-400" for strength 1', () => {
      expect(getStrengthColor(1)).toBe('text-red-400');
    });

    it('should return "text-red-400" for strength 2', () => {
      expect(getStrengthColor(2)).toBe('text-red-400');
    });

    it('should return "text-yellow-400" for strength 3', () => {
      expect(getStrengthColor(3)).toBe('text-yellow-400');
    });

    it('should return "text-blue-400" for strength 4', () => {
      expect(getStrengthColor(4)).toBe('text-blue-400');
    });

    it('should return "text-green-400" for strength 5', () => {
      expect(getStrengthColor(5)).toBe('text-green-400');
    });

    it('should return "text-green-400" for strength greater than 5', () => {
      expect(getStrengthColor(6)).toBe('text-green-400');
      expect(getStrengthColor(10)).toBe('text-green-400');
    });
  });

  describe('Integration tests', () => {
    it('should work together correctly for a weak password', () => {
      const strength = calculatePasswordStrength('short');
      expect(getStrengthText(strength.strength)).toBe('Weak password');
      expect(getStrengthColor(strength.strength)).toBe('text-red-400');
    });

    it('should work together correctly for a weak password with length', () => {
      const strength = calculatePasswordStrength('password');
      expect(getStrengthText(strength.strength)).toBe('Weak password');
      expect(getStrengthColor(strength.strength)).toBe('text-red-400');
    });

    it('should work together correctly for a fair password', () => {
      const strength = calculatePasswordStrength('Password');
      expect(getStrengthText(strength.strength)).toBe('Fair password');
      expect(getStrengthColor(strength.strength)).toBe('text-yellow-400');
    });

    it('should work together correctly for a good password', () => {
      const strength = calculatePasswordStrength('Password1A');
      expect(getStrengthText(strength.strength)).toBe('Good password');
      expect(getStrengthColor(strength.strength)).toBe('text-blue-400');
    });

    it('should work together correctly for a strong password', () => {
      const strength = calculatePasswordStrength('Password1!');
      expect(getStrengthText(strength.strength)).toBe('Strong password!');
      expect(getStrengthColor(strength.strength)).toBe('text-green-400');
    });
  });
});
