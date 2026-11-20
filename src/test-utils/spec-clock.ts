import { setClock } from 'pubky-social-specs/testing';
import { afterEach, beforeEach } from 'vitest';
import { VRT_FROZEN_NOW_MS } from './vrt.clock';

/**
 * Freezes the data model's clock (`pubky-social-specs`), so the ids and `created_at` its
 * builders produce are known in advance. The clock is per copy of the package, so every test
 * worker sharing one module instance shares it: restore it after the test.
 */
export function freezeSpecClock(nowMs: number = VRT_FROZEN_NOW_MS): void {
  setClock(() => nowMs);
}

/** Hands the clock back to the engine; the guard that keeps ids increasing starts over. */
export function restoreSpecClock(): void {
  setClock();
}

/** Freezes the clock around every test of the calling `describe` block. */
export function withFrozenSpecClock(nowMs: number = VRT_FROZEN_NOW_MS): void {
  beforeEach(() => freezeSpecClock(nowMs));
  afterEach(restoreSpecClock);
}
