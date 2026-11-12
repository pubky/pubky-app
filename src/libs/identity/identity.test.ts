import { Keypair } from '@synonymdev/pubky';
import * as bip39 from 'bip39';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { asInvalid } from '@/test-utils/type-assertions';
import { Identity } from './identity';

// Mock @synonymdev/pubky
const mockCreateRecoveryFile = vi.fn(() => new Uint8Array([1, 2, 3, 4, 5]));
const mockPublicKey = {
  z32: vi.fn(() => 'test-public-key'),
  toString: vi.fn(() => 'test-public-key'),
};
const mockKeypair = {
  publicKey: mockPublicKey,
  secret: vi.fn(() => new Uint8Array(32).fill(1)),
  createRecoveryFile: mockCreateRecoveryFile,
};

vi.mock('@synonymdev/pubky', () => ({
  Keypair: {
    fromSecret: vi.fn(() => mockKeypair),
    fromRecoveryFile: vi.fn(() => mockKeypair),
  },
}));

describe('Identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createRecoveryFile', () => {
    beforeEach(() => {
      // Reset the mock
      mockCreateRecoveryFile.mockClear();
      mockCreateRecoveryFile.mockReturnValue(new Uint8Array([1, 2, 3, 4, 5]));

      // Mock document methods for file download
      Object.defineProperty(document, 'createElement', {
        value: vi.fn().mockImplementation((tagName) => {
          if (tagName === 'a') {
            return {
              href: '',
              download: '',
              click: vi.fn(),
              remove: vi.fn(),
            };
          }
          return {};
        }),
        writable: true,
      });

      Object.defineProperty(document.body, 'appendChild', {
        value: vi.fn(),
        writable: true,
      });

      Object.defineProperty(document.body, 'removeChild', {
        value: vi.fn(),
        writable: true,
      });

      // Mock URL methods
      Object.defineProperty(global, 'URL', {
        value: {
          createObjectURL: vi.fn().mockReturnValue('mock-url'),
          revokeObjectURL: vi.fn(),
        },
        writable: true,
      });

      // Mock Blob constructor
      const MockBlobConstructor = vi.fn(function (
        this: { content: BlobPart[]; options: BlobPropertyBag },
        content: BlobPart[],
        options: BlobPropertyBag,
      ) {
        this.content = content;
        this.options = options;
      });
      Object.defineProperty(global, 'Blob', {
        value: MockBlobConstructor,
        writable: true,
      });
    });

    it('should create recovery file successfully with valid keypair', () => {
      // Use a mock keypair object with createRecoveryFile method
      const keypairWithMethod = {
        ...mockKeypair,
        createRecoveryFile: mockCreateRecoveryFile,
      };

      expect(() => {
        Identity.createRecoveryFile({ keypair: keypairWithMethod as never, passphrase: 'password123' });
      }).not.toThrow();

      // Verify that createRecoveryFile was called on the keypair
      expect(mockCreateRecoveryFile).toHaveBeenCalledWith('password123');
      // Verify that the download process was initiated
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('should throw error when keypair.createRecoveryFile throws', () => {
      const keypairWithFailingMethod = {
        ...mockKeypair,
        createRecoveryFile: vi.fn(() => {
          throw new Error('Recovery file creation failed');
        }),
      };

      expect(() => {
        Identity.createRecoveryFile({ keypair: keypairWithFailingMethod as never, passphrase: 'password123' });
      }).toThrow();
    });

    it('should handle createRecoveryFile errors and throw AppError', () => {
      const keypairWithFailingMethod = {
        ...mockKeypair,
        createRecoveryFile: vi.fn(() => {
          throw new Error('Recovery file creation failed');
        }),
      };

      try {
        Identity.createRecoveryFile({ keypair: keypairWithFailingMethod as never, passphrase: 'password123' });
      } catch (error) {
        expect(error).toHaveProperty('category', ErrorCategory.Client);
        expect(error).toHaveProperty('code', ClientErrorCode.UNPROCESSABLE);
      }
    });
  });

  describe('keypairFromSecretKey', () => {
    it('should create keypair from valid secret key', () => {
      const secretKey = new Uint8Array(32).fill(1); // valid 32-byte array
      const secretKeyHex = Buffer.from(secretKey).toString('hex');

      const result = Identity.keypairFromSecretKey(secretKeyHex);

      expect(result).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should throw error for invalid secret key format', () => {
      const invalidSecretKey = 'invalid-hex-string';
      vi.mocked(Keypair.fromSecret).mockImplementationOnce(() => {
        throw new Error('Invalid secret key');
      });

      expect(() => Identity.keypairFromSecretKey(invalidSecretKey)).toThrow();
    });

    it('should throw AppError with proper error type for invalid secret key', () => {
      const invalidSecretKey = 'invalid-hex-string';
      vi.mocked(Keypair.fromSecret).mockImplementationOnce(() => {
        throw new Error('Invalid secret key');
      });

      try {
        Identity.keypairFromSecretKey(invalidSecretKey);
      } catch (error) {
        expect(error).toHaveProperty('category', ErrorCategory.Validation);
        expect(error).toHaveProperty('code', ValidationErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('keypairFromMnemonic', () => {
    // Standard BIP39 test vector; any valid 12-word phrase works here.
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should generate a valid keypair from mnemonic', () => {
      const keypair = Identity.keypairFromMnemonic(mnemonic);

      expect(keypair).toBeDefined();
      // The mock returns a keypair object
      expect(keypair.publicKey).toBeDefined();
    });

    it('derives the secret key from the first 32 bytes of the BIP39 seed', () => {
      // Recovery phrases created by the former in-browser sign-up used this derivation, so it must not change.
      Identity.keypairFromMnemonic(mnemonic);

      const expectedSecret = bip39.mnemonicToSeedSync(mnemonic).subarray(0, 32);
      expect(Array.from(vi.mocked(Keypair.fromSecret).mock.calls[0][0])).toEqual(Array.from(expectedSecret));
    });

    it('should throw error for invalid mnemonic', () => {
      const invalidMnemonic = 'invalid mnemonic phrase test';

      expect(() => Identity.keypairFromMnemonic(invalidMnemonic)).toThrow();
    });

    it('should generate consistent keypairs for same mnemonic', () => {
      const keypair1 = Identity.keypairFromMnemonic(mnemonic);
      const keypair2 = Identity.keypairFromMnemonic(mnemonic);

      // Both calls should succeed (the mock returns the same keypair)
      expect(keypair1).toBeDefined();
      expect(keypair2).toBeDefined();
    });
  });

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
