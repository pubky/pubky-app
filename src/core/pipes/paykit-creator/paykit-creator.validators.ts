import { HttpStatusCode } from '@/libs/http/http.types';
import { isPubkyIdentifier, stripPubkyPrefix, withPubkyPrefix } from '@/libs/utils/utils';

type TPaykitCreatorValidationResult =
  | { ok: true; creator: string; returnTo: string }
  | { ok: false; message: string; statusCode: HttpStatusCode.BAD_REQUEST };

/**
 * Validates the query of the Paykit creator probe. Pure: the route hands in raw `searchParams`
 * values, and what comes out is what the Paykit Server is allowed to see.
 *
 * - `creator` must be a pubky (with or without the `pubky` prefix); it leaves in Paykit's canonical
 *   `pubky<z32>` form, the only one `/setup/reconnect` parses.
 * - `returnTo` must be an http(s) URL and leaves as its bare origin, the form the setup iframe sends.
 */
export class PaykitCreatorValidators {
  private constructor() {}

  static validateSafe(creator: string | null, returnTo: string | null): TPaykitCreatorValidationResult {
    const bareCreator = stripPubkyPrefix((creator ?? '').trim());
    if (!isPubkyIdentifier(bareCreator)) {
      return { ok: false, message: 'Invalid creator', statusCode: HttpStatusCode.BAD_REQUEST };
    }

    let parsed: URL;
    try {
      parsed = new URL((returnTo ?? '').trim());
    } catch {
      return invalidReturnTo();
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return invalidReturnTo();

    return { ok: true, creator: withPubkyPrefix(bareCreator), returnTo: parsed.origin };
  }
}

function invalidReturnTo(): Extract<TPaykitCreatorValidationResult, { ok: false }> {
  return { ok: false, message: 'Invalid return_to', statusCode: HttpStatusCode.BAD_REQUEST };
}
