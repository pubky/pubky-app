import { PaykitCreatorApplication } from '@/application/paykit-creator/paykit-creator';
import { PaykitCreatorValidators } from '@/pipes/paykit-creator/paykit-creator.validators';
import type { TPaykitCreatorControllerResult } from './paykit-creator.types';

/**
 * Entry point of the Paykit creator probe, called from the API route.
 */
export class PaykitCreatorController {
  private constructor() {}

  /**
   * Asks Paykit (network only, no cache) whether it already holds `creator`.
   *
   * @param params.creator - Raw `creator` query value (may be null)
   * @param params.returnTo - Raw `return_to` query value (may be null)
   * @returns The answer, or a validation failure for a malformed query
   * @throws AppError when Paykit cannot answer.
   */
  static async fetchCreatorHeld(params: {
    creator: string | null;
    returnTo: string | null;
  }): Promise<TPaykitCreatorControllerResult> {
    const validation = PaykitCreatorValidators.validateSafe(params.creator, params.returnTo);
    if (!validation.ok) {
      return { ok: false, message: validation.message, statusCode: validation.statusCode };
    }
    const held = await PaykitCreatorApplication.isCreatorHeld({
      creator: validation.creator,
      returnTo: validation.returnTo,
    });
    return { ok: true, held };
  }
}
