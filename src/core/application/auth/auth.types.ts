import { Keypair } from '@synonymdev/pubky';
import type { THomeserverSessionResult } from '@/services/homeserver/homeserver.types';
import type { AuthStore } from '@/stores/auth/auth.types';

export type TKeypairParams = {
  keypair: Keypair;
};

export type TSecretKey = {
  secretKey: string;
};

export type THomeserverAuthenticateParams = TKeypairParams & TSecretKey;

export interface TRestoreSessionParams {
  authStore: AuthStore;
}

export type TRestoreSessionResult = Promise<THomeserverSessionResult | null>;
