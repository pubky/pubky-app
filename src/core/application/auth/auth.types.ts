import { Keypair, type Session } from '@synonymdev/pubky';
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

export type TRestoreSessionOutcome =
  | { status: 'restored'; session: Session }
  | { status: 'signed-out' }
  | { status: 'deferred' };

export type TRestoreSessionResult = Promise<TRestoreSessionOutcome>;

export type TRestorePersistedSessionResult = { status: TRestoreSessionOutcome['status'] };
