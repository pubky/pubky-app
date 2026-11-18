import { Keypair } from '@synonymdev/pubky';

/**
 * A string of 12 words separated by spaces
 */
export type TMnemonicWords = string;

export interface TCreateRecoveryFileParams {
  keypair: Keypair;
  passphrase: string;
}
