import { Keypair } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';
import type { THomeserverSessionResult } from '@/services/homeserver/homeserver.types';

export class Identity {
  /**
   * Converts a keypair to a z32 pubky string
   * @param keypair - The keypair to convert
   * @returns The z-base32 encoding of this public key
   */
  static z32FromKeypair(keypair: Keypair): Pubky {
    return keypair.publicKey.z32();
  }

  /**
   * Gets the z32 pubky from a session
   * @param session - The session to get the pubky from
   * @returns The z32 pubky
   */
  static z32FromSession({ session }: THomeserverSessionResult): Pubky {
    return session.info.publicKey.z32();
  }

  /**
   * Gets the human-readable pubky from a session
   * @param session - The session to get the pubky from
   * @returns The pubky string with prefix
   */
  static pubkyFromSession({ session }: THomeserverSessionResult): string {
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
