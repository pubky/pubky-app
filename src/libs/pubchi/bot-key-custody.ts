import { Keypair } from '@synonymdev/pubky';
import * as bip39 from 'bip39';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isPubkyId } from './schemas/pubky';

export type MintedBotKey = {
  bot: string;
  phrase: string;
};

export function mintBotKey(): MintedBotKey {
  const entropy = new Uint8Array(16);
  const entropyCopy = Buffer.alloc(16);

  let phrase: string | undefined;
  try {
    crypto.getRandomValues(entropy);
    entropyCopy.set(entropy);
    phrase = bip39.entropyToMnemonic(entropyCopy, bip39.wordlists.english);
    return { bot: deriveBot(phrase), phrase };
  } catch {
    phrase = undefined;
    throw custodyError('PUBCHI_KEY_MINT_FAILED', 'mintBotKey');
  } finally {
    entropy.fill(0);
    entropyCopy.fill(0);
  }
}

export function phraseToBot(phrase: string): string {
  if (!bip39.validateMnemonic(phrase, bip39.wordlists.english) || phrase.trim().split(/\s+/).length !== 12) {
    throw custodyError('PUBCHI_PHRASE_INVALID', 'phraseToBot');
  }

  try {
    return deriveBot(phrase);
  } catch {
    throw custodyError('PUBCHI_KEY_DERIVATION_FAILED', 'phraseToBot');
  }
}

function deriveBot(phrase: string): string {
  const seed = bip39.mnemonicToSeedSync(phrase, '');
  const secret = new Uint8Array(32);
  secret.set(seed.subarray(0, 32));
  let keypair: Keypair | undefined;

  try {
    keypair = Keypair.fromSecret(secret);
    const bot = keypair.publicKey.z32();
    if (!isPubkyId(bot)) throw custodyError('PUBCHI_KEY_DERIVATION_FAILED', 'deriveBot');
    return bot;
  } finally {
    try {
      keypair?.free();
    } finally {
      secret.fill(0);
      seed.fill(0);
    }
  }
}

function custodyError(code: string, operation: string) {
  return Err.validation(ValidationErrorCode.INVALID_INPUT, code, {
    service: ErrorService.Pubchi,
    operation,
  });
}
