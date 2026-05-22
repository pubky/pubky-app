import type { Keypair, Session } from '@synonymdev/pubky';
import type { Pubky } from '@/models/models.types';
import { asOpaque } from './type-assertions';

/**
 * Minimal `@synonymdev/pubky` `Session` double.
 *
 * `Session` has a private constructor, so tests that need one supply a partial
 * shape and cast. Consolidating the cast here means test bodies stay typed
 * against the real `Session` type rather than `any`.
 */
export const mockSession = (partial: Partial<Session> = {}): Session => asOpaque<Session>({ ...partial });

/**
 * Minimal `@synonymdev/pubky` `Keypair` double.
 *
 * Same rationale as {@link mockSession} — `Keypair` cannot be instantiated
 * outside the SDK, so tests supply a partial shape through a single cast.
 */
export const mockKeypair = (partial: Partial<Keypair> = {}): Keypair => asOpaque<Keypair>({ ...partial });

/**
 * Tag a plain string as a `Pubky`. `Pubky` is currently a string
 * alias, but wrapping the construction in a helper keeps test call sites
 * self-documenting and future-proofs us against branding the type later.
 */
export const mockPubky = (id: string): Pubky => id as Pubky;

/** Staging-shaped valid pubky (52 × [a-z0-9]) for route / composite-id tests */
export const PUBKY_52_STAGING_FIXTURE = '68rkfi1d78baobycj6w4b7dga43o8qtnuhubban5at6qywrieb5y';

/** Valid-looking post id segment from the same environment */
export const POST_ID_STAGING_FIXTURE = '00353GZ1H40WG';

export const PUBKY_INVALID_TOO_LONG = `${PUBKY_52_STAGING_FIXTURE}x`;

/** 52 chars but invalid (uppercase breaks pubky identifier rules) */
export const PUBKY_INVALID_BAD_CHAR = `${PUBKY_52_STAGING_FIXTURE.slice(0, 51)}O`;
