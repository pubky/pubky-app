import { buildUri, listPrefix, parseOwner, parsePostId, ValidationError } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';

/**
 * The v1 reference of the post, or null when the key or the id is not one the data model spells
 * (a URL still being typed or pasted). Runs on every keystroke, so nothing it refuses may throw.
 */
export function buildPostUriOrNull(pubky: Pubky, id: string): string | null {
  try {
    return buildUri(parseOwner(pubky), 'post', parsePostId(id));
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

/**
 * Both spellings of a reference to one post, the v1 one first. Nexus serves the 0.x spelling
 * (`/pub/pubky.app/posts/{id}`) for posts of an account that has not migrated, and a v1 write
 * references the post as `buildUri` spells it, so a lookup by URI has to match either.
 */
export function postReferenceSpellings(pubky: Pubky, postId: string): [v1: string, legacy: string] {
  try {
    return [buildUri(pubky, 'post', postId), `${listPrefix(pubky, 'legacy')}posts/${postId}`];
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, error.message, {
      service: ErrorService.SocialSpecs,
      operation: 'postReferenceSpellings',
      context: { pubky, postId, code: error.code, field: error.field },
      cause: error,
    });
  }
}
