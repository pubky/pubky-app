import { PubkySpecsBuilder } from 'pubky-app-specs';
import type { Pubky } from '@/models/models.types';

export class PubkySpecsSingleton {
  private static builder: PubkySpecsBuilder | null = null;

  private constructor() {}

  static get(pubky: Pubky): PubkySpecsBuilder {
    if (!this.builder) {
      this.builder = new PubkySpecsBuilder(pubky);
    }
    return this.builder;
  }

  /**
   * Resets the singleton state. Should be called during sign-out
   * to ensure clean state for subsequent sign-ins.
   * Also useful for testing purposes.
   */
  static reset(): void {
    this.builder = null;
  }
}
