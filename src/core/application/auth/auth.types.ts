import { Keypair } from '@synonymdev/pubky';
import type { TSignUpParams } from '@/controllers/auth/auth.types';
import type { Pubky } from '@/models/models.types';
import type { THomeserverSessionResult } from '@/services/homeserver/homeserver.types';
import type { AuthStore } from '@/stores/auth/auth.types';
export type TKeypairParams = {
  keypair: Keypair;
};

export type TSecretKey = {
  secretKey: string;
};

export type TAuthenticateKeypairParams = TSignUpParams & TSecretKey;

export type THomeserverAuthenticateParams = TKeypairParams & TSecretKey;

export type TLogoutParams = TSecretKey & {
  pubky: Pubky;
};

export interface TRestoreSessionParams {
  authStore: AuthStore;
}

export type TRestoreSessionResult = Promise<THomeserverSessionResult | null>;
