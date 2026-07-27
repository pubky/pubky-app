import { z } from 'zod';

const safeExternalUrlProtocolSchema = z.union(
  [
    z.url({ protocol: /^https?$/, error: 'Invalid URL' }),
    z.url({ protocol: /^mailto$/, error: 'Invalid URL' }),
    z.url({ protocol: /^tel$/, error: 'Invalid URL' }),
  ],
  { error: 'Invalid URL' },
);

/**
 * Shared policy for user-controlled URLs that may be rendered or opened.
 *
 * Trimming happens before WHATWG parsing so callers receive the same value
 * that was validated. The protocol check is performed on the parsed URL,
 * which also catches mixed-case and control-character-obfuscated schemes.
 */
export const safeExternalUrlSchema = z.string().trim().pipe(safeExternalUrlProtocolSchema);

/** Returns the validated, trimmed URL or null when it is unsafe or malformed. */
export function getSafeExternalUrl(value: string): string | null {
  const result = safeExternalUrlSchema.safeParse(value);
  return result.success ? result.data : null;
}
