import type { Capabilities, Session } from '@synonymdev/pubky';
import type { TKeypairParams } from '@/application/auth/auth.types';
import { HttpMethod } from '@/libs/http/http.types';

export type FetchOptions = {
  method?: HttpMethod;
  body?: string | Uint8Array;
};

export type THomeserverSignUpParams = TKeypairParams & {
  signupToken: string;
};

/** Homeserver signup token verification outcome from GET /signup_tokens/<token>. */
export type TSignupTokenVerificationStatus = 'valid' | 'used' | 'invalid';

export type THomeserverSessionResult = {
  session: Session;
};

export type TGenerateAuthUrlResult = {
  authorizationUrl: string;
  awaitApproval: Promise<Session>;
  cancelAuthFlow: () => void;
};

export type THomeserverRestoreSessionParams = {
  sessionExport: string;
};

export type CancelableAuthApproval = {
  awaitApproval: Promise<Session>;
  cancel: () => void;
};

/**
 * Type alias for pub path pattern.
 * Represents paths that start with '/pub/' followed by any string.
 *
 * @example
 * ```typescript
 * const validPath: PubPath<string> = '/pub/user/profile';
 * const validPath2: PubPath<string> = '/pub/pubky.app/:rw';
 * ```
 */
export type PubPath<T extends string = string> = `/pub/${T}`;

export type TGenerateSignupAuthUrlParams = {
  inviteCode: string;
  caps?: Capabilities;
};

export type THomeserverFetchParams = {
  url: string;
  options?: FetchOptions;
};

export type THomeserverRequestParams = {
  method: HttpMethod;
  url: string;
  bodyJson?: Record<string, unknown>;
};

export type TPutBlobParams = {
  url: string;
  blob: Uint8Array;
};

export type THomeserverListParams = {
  baseDirectory: string;
  cursor?: string;
  reverse?: boolean;
  limit?: number;
};

export type THomeserverListAllParams = Pick<THomeserverListParams, 'baseDirectory'>;

export type THomeserverUserEvent = {
  cursor: string;
  eventType: string;
};

// Utility function parameter types
export type TParseResponseOrUndefinedParams = {
  response: Response;
  operation?: string;
  url?: string;
};

export type TResolveOwnedSessionPathParams = {
  url: string;
  session: Session | null;
  pubPathPrefix: string;
};

export type TOwnedSessionPath = {
  session: Session;
  path: PubPath<string>;
};

export type TCheckSessionExpirationParams = {
  response: Response;
  url: string;
};

export type TAssertOkParams = {
  response: Response;
  url: string;
  operation: string;
};

export type TGetOwnedResponseParams = {
  session: Session;
  path: PubPath<string>;
  url: string;
};

// Error utility function parameter types
export type TThrowSessionExpiredErrorParams = {
  errorMessage: string;
  additionalContext: Record<string, unknown>;
};

export type TThrowInvalidInputErrorParams = {
  errorMessage: string;
  additionalContext: Record<string, unknown>;
};

export type TThrowHomeserverErrorParams = {
  statusCode: number;
  errorMessage: string;
  additionalContext: Record<string, unknown>;
};

export type THandleTypedErrorParams = {
  errorMessage: string;
  errorName: string | undefined;
  statusCode: number;
  additionalContext: Record<string, unknown>;
};

export type THandleErrorParams = {
  error: unknown;
  additionalContext?: Record<string, unknown>;
  statusCode?: number;
  alwaysUseHomeserverError?: boolean;
};
