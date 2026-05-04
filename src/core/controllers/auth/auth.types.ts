import { PublicKey } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';

export interface TPubkyParams {
  pubky: Pubky;
}

export interface TPublicKeyParams {
  publicKey: PublicKey;
}

export interface TSignUpParams {
  secretKey: string;
  signupToken: string;
}

export interface TLoginWithMnemonicParams {
  mnemonic: string;
}

export interface TLoginWithEncryptedFileParams {
  encryptedFile: File;
  password: string;
}
