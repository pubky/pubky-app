import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { HumanPhoneInput } from './HumanPhoneInput';
import { parsePhoneNumber } from '@/libs/phone/phone';

describe('HumanPhoneInput', () => {
  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneInput onBack={() => {}} onCodeSent={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('parsePhoneNumber', () => {
  describe('valid phone numbers', () => {
    it('parses a valid US phone number', () => {
      const result = parsePhoneNumber('+14155551234');
      expect(result).toBeDefined();
      expect(result?.country).toBe('US');
      expect(result?.isValid()).toBe(true);
    });

    it('parses a valid Dutch phone number', () => {
      const result = parsePhoneNumber('+31612345678');
      expect(result).toBeDefined();
      expect(result?.country).toBe('NL');
      expect(result?.isValid()).toBe(true);
    });

    it('parses a valid UK phone number', () => {
      const result = parsePhoneNumber('+447400123456');
      expect(result).toBeDefined();
      expect(result?.country).toBe('GB');
      expect(result?.isValid()).toBe(true);
    });

    it('parses a valid German phone number', () => {
      const result = parsePhoneNumber('+4915123456789');
      expect(result).toBeDefined();
      expect(result?.country).toBe('DE');
      expect(result?.isValid()).toBe(true);
    });

    it('parses a valid Belarusian phone number', () => {
      const result = parsePhoneNumber('+375291234567');
      expect(result).toBeDefined();
      expect(result?.country).toBe('BY');
      expect(result?.isValid()).toBe(true);
    });

    it('handles phone numbers with leading/trailing whitespace', () => {
      const result = parsePhoneNumber('  +14155551234  ');
      expect(result).toBeDefined();
      expect(result?.isValid()).toBe(true);
    });

    it('handles phone numbers with spaces between digits', () => {
      const result = parsePhoneNumber('+1 415 555 1234');
      expect(result).toBeDefined();
      expect(result?.isValid()).toBe(true);
    });
  });

  describe('invalid phone numbers', () => {
    it('returns undefined for empty string', () => {
      const result = parsePhoneNumber('');
      expect(result).toBeUndefined();
    });

    it('returns undefined for whitespace only', () => {
      const result = parsePhoneNumber('   ');
      expect(result).toBeUndefined();
    });

    it('returns undefined for number without plus sign', () => {
      const result = parsePhoneNumber('14155551234');
      expect(result).toBeUndefined();
    });

    it('returns undefined for number with letters', () => {
      const result = parsePhoneNumber('+1415abc1234');
      expect(result).toBeUndefined();
    });

    it('returns undefined for number with special characters', () => {
      const result = parsePhoneNumber('+1-415-555-1234');
      expect(result).toBeUndefined();
    });

    it('returns undefined for number with parentheses', () => {
      const result = parsePhoneNumber('+1(415)5551234');
      expect(result).toBeUndefined();
    });

    it('returns undefined for just a plus sign', () => {
      const result = parsePhoneNumber('+');
      expect(result).toBeUndefined();
    });

    it('returns undefined for too short phone number', () => {
      const result = parsePhoneNumber('+1234');
      expect(result).toBeUndefined();
    });

    it('returns undefined for invalid country code', () => {
      const result = parsePhoneNumber('+999123456789');
      expect(result).toBeUndefined();
    });

    it('returns undefined for number with multiple plus signs', () => {
      const result = parsePhoneNumber('++14155551234');
      expect(result).toBeUndefined();
    });

    it('returns undefined for plus sign in middle of number', () => {
      const result = parsePhoneNumber('1+4155551234');
      expect(result).toBeUndefined();
    });
  });
});
