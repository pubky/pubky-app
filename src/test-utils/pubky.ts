import type { Keypair, Session } from '@synonymdev/pubky';

import { asOpaque } from './type-assertions';
import type { Pubky } from '@/models/models.types';
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
