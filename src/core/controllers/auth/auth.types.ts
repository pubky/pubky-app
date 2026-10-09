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

export type SessionReadiness = 'ready' | 'sign-in' | 'unavailable' | 'canceled';
