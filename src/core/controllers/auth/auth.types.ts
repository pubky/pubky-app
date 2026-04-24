import { PublicKey } from '@synonymdev/pubky';

import * as Core from '@/core';

export interface TPubkyParams {
  pubky: Core.Pubky;
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
