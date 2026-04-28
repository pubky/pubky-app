import { PublicKey } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';
import type { NotificationState } from '@/stores/notification/notification.types';
import type { SettingsState } from '@/stores/settings/settings.types';

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

export interface TBootstrapResponse {
  notification: NotificationState;
  remoteSettings: SettingsState | null;
}
