import { HttpStatusCode } from '@/libs/http/http.types';
import { isPubkyIdentifier, stripPubkyPrefix, withPubkyPrefix } from '@/libs/utils/utils';

type TPaykitCreatorValidationResult =
  { ok: true; creator: string } | { ok: false; message: string; statusCode: HttpStatusCode.BAD_REQUEST };

/**
 * Validates the query of the Paykit creator lookup. Pure: the route hands in the raw `searchParams`
 * value, and what comes out is what the Paykit Server is allowed to see.
 *
 * `creator` must be a pubky (with or without the `pubky` prefix); it leaves in Paykit's canonical
 * `pubky<z32>` form, the only one `/setup/creator-held` parses.
 */
export class PaykitCreatorValidators {
  private constructor() {}

  static validateSafe(creator: string | null): TPaykitCreatorValidationResult {
    const bareCreator = stripPubkyPrefix((creator ?? '').trim());
    if (!isPubkyIdentifier(bareCreator)) {
      return { ok: false, message: 'Invalid creator', statusCode: HttpStatusCode.BAD_REQUEST };
    }
    return { ok: true, creator: withPubkyPrefix(bareCreator) };
  }
}
