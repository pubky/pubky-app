import { describe, expect, it } from 'vitest';
import { asInvalid } from '@/test-utils/type-assertions';
import { Identity } from './identity';

describe('Identity', () => {
  describe('extractPubkyPublicKey', () => {
    const validKey = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

    describe('with "pk:" prefix', () => {
      it('should extract valid 52-character lowercase alphanumeric key', () => {
        const result = Identity.extractPubkyPublicKey(`pk:${validKey}`);
        expect(result).toBe(validKey);
      });

      it('should return null for key shorter than 52 characters', () => {
        const result = Identity.extractPubkyPublicKey('pk:o1gg96ewuojmopcjbz8895478wdtxt');
        expect(result).toBeNull();
      });

      it('should return null for key longer than 52 characters', () => {
        const result = Identity.extractPubkyPublicKey(`pk:${validKey}extra`);
        expect(result).toBeNull();
      });

      it('should return null for key with uppercase characters', () => {
        const result = Identity.extractPubkyPublicKey('pk:O1GG96EWUOJMOPCJBZ8895478WDTXTZZBER7AEZQ6ROR5A91J7DY');
        expect(result).toBeNull();
      });

      it('should return null for key with special characters', () => {
        const result = Identity.extractPubkyPublicKey('pk:o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7d!');
        expect(result).toBeNull();
      });

      it('should return null for empty key after prefix', () => {
        const result = Identity.extractPubkyPublicKey('pk:');
        expect(result).toBeNull();
      });
    });

    describe('with "pubky" prefix', () => {
      it('should extract valid 52-character lowercase alphanumeric key', () => {
        const result = Identity.extractPubkyPublicKey(`pubky${validKey}`);
        expect(result).toBe(validKey);
      });

      it('should return null for key shorter than 52 characters', () => {
        const result = Identity.extractPubkyPublicKey('pubkyo1gg96ewuojmopcjbz8895478wdtxt');
        expect(result).toBeNull();
      });

      it('should return null for key longer than 52 characters', () => {
        const result = Identity.extractPubkyPublicKey(`pubky${validKey}extra`);
        expect(result).toBeNull();
      });

      it('should return null for key with uppercase characters', () => {
        const result = Identity.extractPubkyPublicKey('pubkyO1GG96EWUOJMOPCJBZ8895478WDTXTZZBER7AEZQ6ROR5A91J7DY');
        expect(result).toBeNull();
      });

      it('should return null for key with special characters', () => {
        const result = Identity.extractPubkyPublicKey('pubkyo1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7d!');
        expect(result).toBeNull();
      });

      it('should return null for empty key after prefix', () => {
        const result = Identity.extractPubkyPublicKey('pubky');
        expect(result).toBeNull();
      });
    });

    describe('invalid inputs', () => {
      it('should return null for string without valid prefix', () => {
        expect(Identity.extractPubkyPublicKey(validKey)).toBeNull();
      });

      it('should return null for string with wrong prefix', () => {
        expect(Identity.extractPubkyPublicKey(`key:${validKey}`)).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(Identity.extractPubkyPublicKey('')).toBeNull();
      });

      it('should return null for null input', () => {
        expect(Identity.extractPubkyPublicKey(asInvalid<string>(null))).toBeNull();
      });

      it('should return null for undefined input', () => {
        expect(Identity.extractPubkyPublicKey(asInvalid<string>(undefined))).toBeNull();
      });

      it('should return null for non-string input', () => {
        expect(Identity.extractPubkyPublicKey(asInvalid<string>(12345))).toBeNull();
        expect(Identity.extractPubkyPublicKey(asInvalid<string>({}))).toBeNull();
        expect(Identity.extractPubkyPublicKey(asInvalid<string>([]))).toBeNull();
      });

      it('should return null for string with only whitespace', () => {
        expect(Identity.extractPubkyPublicKey('   ')).toBeNull();
      });

      it('should return null for pk: prefix with spaces in key', () => {
        expect(Identity.extractPubkyPublicKey('pk:o1gg96ewuojmopcjbz8895478 wdtxtzzber7aezq6ror5a91j7dy')).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should be case-sensitive for prefix "pk:"', () => {
        expect(Identity.extractPubkyPublicKey(`PK:${validKey}`)).toBeNull();
        expect(Identity.extractPubkyPublicKey(`Pk:${validKey}`)).toBeNull();
      });

      it('should be case-sensitive for prefix "pubky"', () => {
        expect(Identity.extractPubkyPublicKey(`PUBKY${validKey}`)).toBeNull();
        expect(Identity.extractPubkyPublicKey(`Pubky${validKey}`)).toBeNull();
      });

      it('should handle key with all zeros', () => {
        const allZeros = '0000000000000000000000000000000000000000000000000000';
        expect(Identity.extractPubkyPublicKey(`pk:${allZeros}`)).toBe(allZeros);
      });

      it('should handle key with all letters', () => {
        const allLetters = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        expect(Identity.extractPubkyPublicKey(`pk:${allLetters}`)).toBe(allLetters);
      });

      it('should handle key with mixed alphanumeric', () => {
        const mixedKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6';
        expect(Identity.extractPubkyPublicKey(`pubky${mixedKey}`)).toBe(mixedKey);
      });
    });
  });
});
