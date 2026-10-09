import { Keypair } from '@synonymdev/pubky';
import type { SessionReference } from '@/libs/auth/session.types';
import type { AppError } from '@/libs/error/error';
import type { THomeserverSessionResult } from '@/services/homeserver/homeserver.types';

export type TKeypairParams = {
  keypair: Keypair;
};

export type TSecretKey = {
  secretKey: string;
};

export type THomeserverAuthenticateParams = TKeypairParams & TSecretKey;

export interface TRestoreSessionParams {
  reference: SessionReference | null;
  expectedPubky: string | null;
}

export type TRestoreSessionResult = Promise<
  | ({ status: 'restored' } & THomeserverSessionResult)
  | { status: 'none' | 'temporary-error' | 'reauth-required'; error?: AppError }
>;
