import { Keypair } from '@synonymdev/pubky';
import * as bip39 from 'bip39';
import { describe, expect, it, vi } from 'vitest';
import { Identity } from '@/libs/identity/identity';
import { mintBotKey, phraseToBot } from './bot-key-custody';

const TEST_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EXPECTED_BOT = 'aihfhgdfshrj8nz9ofo7khayc1mgcqa4wrrdjahs5tmgo4pna3iy';

describe('bot key custody', () => {
  it('matches the Ring-compatible BIP39 first-32-byte derivation vector', () => {
    expect(phraseToBot(TEST_PHRASE)).toBe(EXPECTED_BOT);
    const keypair = Identity.keypairFromMnemonic(TEST_PHRASE);
    try {
      expect(keypair.publicKey.z32()).toBe(EXPECTED_BOT);
    } finally {
      keypair.free();
    }
  });

  it('zeros every byte buffer allocated by the custody module', () => {
    const observed: Uint8Array[] = [];
    const uintFill = vi.spyOn(Uint8Array.prototype, 'fill');
    const bufferFill = vi.spyOn(Buffer.prototype, 'fill');
    try {
      const minted = mintBotKey();
      expect(bip39.validateMnemonic(minted.phrase)).toBe(true);
      expect(minted.bot).toHaveLength(52);
      observed.push(
        ...(uintFill.mock.instances as Uint8Array[]).filter((value) => value.length === 16 || value.length === 32),
        ...(bufferFill.mock.instances as Buffer[]).filter((value) => value.length === 16 || value.length === 64),
      );
      expect(observed.length).toBeGreaterThanOrEqual(4);
      expect(observed.every((buffer) => buffer.every((byte) => byte === 0))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does not export test-only custody observers', async () => {
    expect(Object.keys(await import('./bot-key-custody')).filter((key) => key.includes('ForTests'))).toEqual([]);
  });

  it('rejects invalid phrases without including them in the error', () => {
    const invalid = 'not a valid recovery value';
    expect(() => phraseToBot(invalid)).toThrow('PUBCHI_PHRASE_INVALID');
    try {
      phraseToBot(invalid);
    } catch (error) {
      expect(String(error)).not.toContain(invalid);
    }
  });

  it('zeros derivation buffers when keypair construction fails', () => {
    const uintFill = vi.spyOn(Uint8Array.prototype, 'fill');
    const bufferFill = vi.spyOn(Buffer.prototype, 'fill');
    vi.spyOn(Keypair, 'fromSecret').mockImplementationOnce(() => {
      throw new Error('injected failure');
    });
    try {
      expect(() => phraseToBot(TEST_PHRASE)).toThrow('PUBCHI_KEY_DERIVATION_FAILED');
      const observed = [
        ...(uintFill.mock.instances as Uint8Array[]).filter((value) => value.length === 32),
        ...(bufferFill.mock.instances as Buffer[]).filter((value) => value.length === 64),
      ];
      expect(observed.length).toBe(2);
      expect(observed.every((buffer) => buffer.every((byte) => byte === 0))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
