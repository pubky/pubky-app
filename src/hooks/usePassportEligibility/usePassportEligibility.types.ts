/**
 * Whether the current browser page can run the Pubky Passport hand-off.
 *
 * - `pending`: server render and first client render (identical markup, no hydration mismatch).
 * - `enabled`: a Passport origin is configured and the page is served over HTTPS.
 * - `disabled`: no Passport origin configured, or the page is plain HTTP (Passport rejects non-HTTPS callbacks).
 */
export type PassportEligibility = 'pending' | 'enabled' | 'disabled';
