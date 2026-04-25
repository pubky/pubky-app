import { asOpaque } from './type-assertions';

/**
 * Build a partial `fetch` `Response` double for tests.
 *
 * The web `Response` type has many fields (`headers`, `body`, `clone`, …) that
 * most tests don't exercise. Consolidate the cast here so call sites stay
 * typed against the shape they actually supply.
 */
export const mockResponse = (partial: Partial<Response> = {}): Response => asOpaque<Response>({ ...partial });
