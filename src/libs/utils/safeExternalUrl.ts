import { z } from 'zod';

const SAFE_EXTERNAL_URL_PROTOCOL_PATTERN = /^(?:https?|mailto|tel)$/;

/**
 * Shared policy for user-controlled URLs that may be rendered or opened.
 *
 * Trimming happens before WHATWG parsing so callers receive the same value
 * that was validated. The protocol check is performed on the parsed URL,
 * which also catches mixed-case and control-character-obfuscated schemes.
 */
export const safeExternalUrlSchema = z
  .string()
  .trim()
  .pipe(
    z.url({
      protocol: SAFE_EXTERNAL_URL_PROTOCOL_PATTERN,
      error: 'Invalid URL',
    }),
  );

/** Returns the validated, trimmed URL or null when it is unsafe or malformed. */
export function getSafeExternalUrl(value: string): string | null {
  const result = safeExternalUrlSchema.safeParse(value);
  return result.success ? result.data : null;
}
