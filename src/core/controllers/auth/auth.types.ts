export type { TRestorePersistedSessionResult } from '@/application/auth/auth.types';

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
