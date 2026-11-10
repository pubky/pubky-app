import type { TPinakesCard, TPinakesCredit } from '@/services/pinakes/pinakes.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * A card's `credits` as the app can trust them: an entry that is not an object or lacks `field`,
 * `provider` or `source_url` is dropped, and every other field that has the wrong type reads as
 * absent (`null`, or `false` for the flags). Anything but an array is no credits at all. Links are
 * not checked here: whoever renders a URL shows it as a link only when it is `http(s)`.
 */
export function normalizePinakesCredits(credits: unknown): TPinakesCredit[] {
  if (!Array.isArray(credits)) return [];

  return credits.flatMap((entry: unknown): TPinakesCredit[] => {
    if (!isRecord(entry)) return [];
    const field = nonEmptyString(entry.field);
    const provider = nonEmptyString(entry.provider);
    const sourceUrl = nonEmptyString(entry.source_url);
    if (!field || !provider || !sourceUrl) return [];

    return [
      {
        field,
        provider,
        source_url: sourceUrl,
        author: nonEmptyString(entry.author),
        license: nonEmptyString(entry.license),
        license_url: nonEmptyString(entry.license_url),
        lang: nonEmptyString(entry.lang),
        excerpted: entry.excerpted === true,
        modified: entry.modified === true,
        subject: nonEmptyString(entry.subject),
      },
    ];
  });
}

/**
 * The card with `normalizePinakesCredits` applied. A card without `credits` (stable sends none) or
 * with `null` is returned as it is: both mean nothing is credited, like `[]`.
 */
export function withNormalizedCredits<T extends TPinakesCard>(card: T): T {
  if (card.credits === undefined || card.credits === null) return card;
  return { ...card, credits: normalizePinakesCredits(card.credits) };
}
