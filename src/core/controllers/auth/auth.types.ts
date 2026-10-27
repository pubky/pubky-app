export interface TSignUpParams {
  secretKey: string;
  signupToken: string;
}

export interface TLoginWithMnemonicParams {
  mnemonic: string;
  expectedPubky?: string;
}

export interface TLoginWithEncryptedFileParams {
  encryptedFile: File;
  password: string;
  expectedPubky?: string;
}

export type SessionReadiness = 'ready' | 'sign-in' | 'unavailable' | 'canceled';
