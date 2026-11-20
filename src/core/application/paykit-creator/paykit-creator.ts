import type { TPaykitCreatorProbeParams } from '@/application/paykit-creator/paykit-creator.types';
import { NextJsPaykitCreatorService } from '@/services/nextjs/paykit-creator/paykit-creator';

/** Whether the Paykit Server already holds a creator. */
export class PaykitCreatorApplication {
  private constructor() {}

  /**
   * @returns `true` when Paykit holds the creator (so only a reconnect can set it up again), `false`
   * when it does not.
   * @throws AppError when Paykit cannot answer.
   */
  static isCreatorHeld(params: TPaykitCreatorProbeParams): Promise<boolean> {
    return NextJsPaykitCreatorService.isCreatorHeld(params);
  }
}
