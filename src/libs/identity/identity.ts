import { Keypair } from '@synonymdev/pubky';
import * as bip39 from 'bip39';
import * as Core from '@/core';
import type { TMnemonicWords, TCreateRecoveryFileParams, TDecryptRecoveryFileParams } from './identity.types';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class Identity {
  // Mention pattern: pk: or pubky followed by exactly 52 lowercase alphanumeric characters
  static readonly PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE = '(?:pk:|pubky)[a-z0-9]{52}';

  /**
   * Creates and downloads a recovery file for the keypair
   * @param keypair - The keypair to create the recovery file for
   * @param passphrase - The passphrase to use to create the recovery file
   * @returns void
   */
  static createRecoveryFile({ keypair, passphrase }: TCreateRecoveryFileParams) {
    try {
      const recoveryFile = keypair.createRecoveryFile(passphrase);
      this.handleDownloadRecoveryFile({ recoveryFile, filename: 'recovery.pkarr' });
    } catch (error) {
      // Re-throw validation errors
      if (error instanceof Error && error.message.includes('Invalid secret key')) {
        throw error;
      }

      throw Err.client(ClientErrorCode.UNPROCESSABLE, 'Failed to create recovery file, invalid secret key', {
        service: ErrorService.Local,
        operation: 'createRecoveryFile',
        context: { originalError: error instanceof Error ? error.message : 'Unknown error' },
        cause: error,
      });
    }
  }

  /**
   * Handles the download of the recovery file to the user's computer
   * @param recoveryFile - The recovery file to download
   * @param filename - The filename to use for the download
   * @returns void
   */
  private static handleDownloadRecoveryFile({
    recoveryFile,
    filename,
  }: {
    recoveryFile: Uint8Array;
    filename: string;
  }) {
    try {
      const arrayBuffer = new ArrayBuffer(recoveryFile.byteLength);
      new Uint8Array(arrayBuffer).set(recoveryFile);
      const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(link.href);
    } catch (error) {
      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Failed to download recovery file', {
        service: ErrorService.Local,
        operation: 'handleDownloadRecoveryFile',
        cause: error,
      });
    }
  }

  /**
   * Decrypts a recovery file and returns the keypair
   * @param encryptedFile - The encrypted recovery file
   * @param passphrase - The passphrase to decrypt the recovery file
   * @returns The keypair
   */
  static async decryptRecoveryFile({ encryptedFile, passphrase }: TDecryptRecoveryFileParams) {
    const arrayBuffer = await encryptedFile.arrayBuffer();
    const recoveryFile = new Uint8Array(arrayBuffer);
    try {
      return Keypair.fromRecoveryFile(recoveryFile, passphrase);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid recovery file or passphrase', {
        service: ErrorService.Local,
        operation: 'decryptRecoveryFile',
        cause: error,
      });
    }
  }

  /**
   * Converts a keypair to a z32 pubky string
   * @param keypair - The keypair to convert
   * @returns The z-base32 encoding of this public key
   */
  static z32FromKeypair(keypair: Keypair): Core.Pubky {
    return keypair.publicKey.z32();
  }

  /**
   * Converts a secret key to a z32 pubky string
   * @param secretKey - The secret key to convert
   * @returns The z-base32 encoding of this public key
   */
  static z32FromSecret(secretKey: string): Core.Pubky {
    const secretKeyUint8Array = this.secretKeyFromHex(secretKey);
    const keypair = Keypair.fromSecret(secretKeyUint8Array);
    return keypair.publicKey.z32();
  }

  /**
   * Converts a keypair to a human-readable pubky string
   * @param keypair - The keypair to convert
   * @returns The pubky string with prefix
   */
  static pubkyFromKeypair(keypair: Keypair): string {
    return keypair.publicKey.toString();
  }

  /**
   * Converts a secret key to a human-readable pubky string
   * @param secretKey - The secret key to convert
   * @returns The pubky string with prefix
   */
  static pubkyFromSecret(secretKey: string): string {
    const secretKeyUint8Array = this.secretKeyFromHex(secretKey);
    const keypair = Keypair.fromSecret(secretKeyUint8Array);
    return keypair.publicKey.toString();
  }

  /**
   * Generates a 12-word mnemonic recovery phrase
   * @returns The mnemonic recovery phrase
   */
  private static generateMnemonic(): TMnemonicWords {
    try {
      // Generate 12-word mnemonic using BIP39 standard (128 bits entropy)
      const mnemonic = bip39.generateMnemonic(128);

      // Validate the generated mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Generated mnemonic failed validation');
      }

      const words = mnemonic.split(' ');

      // Ensure we have exactly 12 words
      if (words.length !== 12) {
        throw new Error(`Expected 12 words, got ${words.length}`);
      }

      return words.join(' ');
    } catch (error) {
      throw Err.client(ClientErrorCode.UNPROCESSABLE, 'Failed to generate BIP39 seed words, invalid mnemonic', {
        service: ErrorService.Local,
        operation: 'generateMnemonic',
        context: { originalError: error instanceof Error ? error.message : 'Unknown error' },
        cause: error,
      });
    }
  }

  /**
   * Generates a secret key from a mnemonic and returns it in hex format
   * @param mnemonic - The mnemonic to generate the secret key from
   * @returns The secret key as a hexadecimal string (64 characters representing 32 bytes)
   */
  private static generateSecretKeyFromMnemonic(mnemonic: string): string {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid mnemonic', {
        service: ErrorService.Local,
        operation: 'generateSecretKeyFromMnemonic',
      });
    }

    try {
      // Convert mnemonic to seed using BIP39 standard
      const seedMnemonic = bip39.mnemonicToSeedSync(mnemonic);
      // Use first 32 bytes as secret key
      const secretKey = new Uint8Array(seedMnemonic.subarray(0, 32));
      // Convert secret key to hex string format
      return this.secretKeyToHex(secretKey);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to generate secret key from mnemonic', {
        service: ErrorService.Local,
        operation: 'generateSecretKeyFromMnemonic',
        context: { originalError: error instanceof Error ? error.message : 'Unknown error' },
        cause: error,
      });
    }
  }

  /**
   * Converts a secret key to a keypair
   * @param secretKey - The secret key to convert
   * @returns The keypair
   */
  static keypairFromSecretKey(secretKey: string): Keypair {
    try {
      const secretKeyUint8Array = this.secretKeyFromHex(secretKey);
      return Keypair.fromSecret(secretKeyUint8Array);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid secret key format', {
        service: ErrorService.Local,
        operation: 'keypairFromSecretKey',
        cause: error,
      });
    }
  }

  /**
   * Generates a new pair of secret key and mnemonic
   * @returns The secret key and mnemonic
   */
  static generateSecrets(): Core.TOnboardingSecrets {
    // Generate mnemonic first, then create secret key from it
    const mnemonic = this.generateMnemonic();
    const secretKey = this.generateSecretKeyFromMnemonic(mnemonic);

    return { secretKey, mnemonic };
  }

  /**
   * Converts a hex string to a Uint8Array
   * @param secretKey - The hex string
   * @returns The secret key as a Uint8Array
   */
  private static secretKeyFromHex(secretKey: string) {
    try {
      return new Uint8Array(Buffer.from(secretKey, 'hex'));
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid secret key format', {
        service: ErrorService.Local,
        operation: 'secretKeyFromHex',
        cause: error,
      });
    }
  }

  /**
   * Converts a Uint8Array to a hex string
   * @param secretKey - The secret key as a Uint8Array
   * @returns The secret key as a hex string
   */
  static secretKeyToHex(secretKey: Uint8Array) {
    try {
      return Buffer.from(secretKey).toString('hex');
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid secret key format', {
        service: ErrorService.Local,
        operation: 'secretKeyToHex',
        cause: error,
      });
    }
  }

  /**
   * Converts a mnemonic to a keypair
   * @param mnemonic - The mnemonic to convert
   * @returns The keypair
   */
  static keypairFromMnemonic(mnemonic: string) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid recovery phrase', {
        service: ErrorService.Local,
        operation: 'keypairFromMnemonic',
      });
    }

    try {
      // Convert mnemonic to seed using BIP39 standard
      const seedMnemonic = bip39.mnemonicToSeedSync(mnemonic);

      // Use first 32 bytes as secret key (same as signup process)
      // TODO: const secretKey = new Uint8Array(seedMnemonic.subarray(0, 32));
      const secretKey = seedMnemonic.slice(0, 32);

      return Keypair.fromSecret(secretKey);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to restore keypair from recovery phrase', {
        service: ErrorService.Local,
        operation: 'keypairFromMnemonic',
        context: { originalError: error instanceof Error ? error.message : 'Unknown error' },
        cause: error,
      });
    }
  }

  /**
   * Gets the z32 pubky from a session
   * @param session - The session to get the pubky from
   * @returns The z32 pubky
   */
  static z32FromSession({ session }: Core.THomeserverSessionResult): Core.Pubky {
    return session.info.publicKey.z32();
  }

  /**
   * Gets the human-readable pubky from a session
   * @param session - The session to get the pubky from
   * @returns The pubky string with prefix
   */
  static pubkyFromSession({ session }: Core.THomeserverSessionResult): string {
    return session.info.publicKey.toString();
  }

  /**
   * Extracts the public key from a pubky identifier string
   * Validates that the input matches the expected format and returns only the key portion
   *
   * @param pubky - The pubky identifier string (e.g., "pk:abc123..." or "pubkyabc123...")
   * @returns The 52-character public key portion, or null if the format is invalid
   *
   * @example
   * Identity.extractPubkyPublicKey("pk:abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop") // "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop"
   * Identity.extractPubkyPublicKey("pubkyabcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop") // "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop"
   * Identity.extractPubkyPublicKey("invalid") // null
   */
  static extractPubkyPublicKey(pubky: string): string | null {
    if (!pubky || typeof pubky !== 'string') {
      return null;
    }

    // Pattern for 52 lowercase alphanumeric characters
    const keyPattern = /^[a-z0-9]{52}$/;

    // Check for "pk:" prefix
    if (pubky.startsWith('pk:')) {
      const key = pubky.slice(3);
      return keyPattern.test(key) ? key : null;
    }

    // Check for "pubky" prefix
    if (pubky.startsWith('pubky')) {
      const key = pubky.slice(5);
      return keyPattern.test(key) ? key : null;
    }

    return null;
  }
}
