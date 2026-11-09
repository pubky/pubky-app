/**
 * Per-region modes for paid unlocks, in the grammar the Shop and the transaction service use, so one
 * `REGION_MODES` value can be set on every deployment:
 *
 * - `open`: nothing is restricted.
 * - `nuanced`: the Shop's EU and UK fence applies there, and paid unlocks are held, as in `blocked`.
 * - `blocked`: no buying, selling or paid unlocks for people in the region.
 *
 * Grammar: a comma-separated list of `SELECTOR=MODE`. A selector is an ISO 3166-1 alpha-2 code, `EU` (the
 * 27 member states) or `UNKNOWN` (a visitor whose country can't be determined). Later entries override
 * earlier ones, so `EU=nuanced,DE=blocked` works. `none` alone means everything is open. Countries nobody
 * names are open. `UNKNOWN` defaults to the strictest mode in force.
 *
 * Pure: no IO and no config reads, so the runtime-config schema validates the setting with the same parser
 * the app evaluates it with.
 */

const REGION_MODE_VALUES = ['open', 'nuanced', 'blocked'] as const;
export type RegionMode = (typeof REGION_MODE_VALUES)[number];

const REGION_MODES_NONE = 'none';
const REGION_SELECTOR_EU = 'EU';
const REGION_SELECTOR_UNKNOWN = 'UNKNOWN';

/** The EU member states as ISO 3166-1 alpha-2 codes (Greece is `GR`). */
export const EU_27 = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const;

const STRICTNESS: Readonly<Record<RegionMode, number>> = { open: 0, nuanced: 1, blocked: 2 };

export interface RegionModeEntry {
  /** An uppercase alpha-2 code, `EU` or `UNKNOWN`. */
  selector: string;
  mode: RegionMode;
}

export type RegionModesParseResult =
  | {
      ok: true;
      entries: readonly RegionModeEntry[];
      /** The setting rewritten in canonical case and spacing; `none` for an empty list. */
      canonical: string;
    }
  | { ok: false; error: string };

function isRegionMode(value: string): value is RegionMode {
  return (REGION_MODE_VALUES as readonly string[]).includes(value);
}

function fail(error: string): RegionModesParseResult {
  return { ok: false, error };
}

/** Parses the `SELECTOR=MODE` list. Malformed input is rejected, never guessed at. */
export function parseRegionModes(raw: string): RegionModesParseResult {
  const text = raw.trim();
  if (text === '') return fail('expected a list like EU=blocked,US=blocked, or "none"');
  if (text.toLowerCase() === REGION_MODES_NONE) return { ok: true, entries: [], canonical: REGION_MODES_NONE };

  const entries: RegionModeEntry[] = [];
  for (const item of text.split(',')) {
    const parts = item.split('=');
    if (parts.length !== 2) return fail(`${JSON.stringify(item.trim())} is not SELECTOR=MODE`);
    const selector = parts[0].trim().toUpperCase();
    const mode = parts[1].trim().toLowerCase();
    if (selector === 'UK') return fail('UK is not an ISO code; use GB');
    if (selector !== REGION_SELECTOR_EU && selector !== REGION_SELECTOR_UNKNOWN && !/^[A-Z]{2}$/.test(selector)) {
      return fail(`${JSON.stringify(parts[0].trim())} is not a two-letter country code, EU or UNKNOWN`);
    }
    if (!isRegionMode(mode)) {
      return fail(`${JSON.stringify(parts[1].trim())} is not a mode: use ${REGION_MODE_VALUES.join(', ')}`);
    }
    entries.push({ selector, mode });
  }
  return { ok: true, entries, canonical: entries.map((entry) => `${entry.selector}=${entry.mode}`).join(',') };
}

export interface RegionPolicy {
  /** Every country that is not open, with its mode (`GB` stands in for the `UK` alias). */
  readonly regions: ReadonlyMap<string, RegionMode>;
  /** The mode of a visitor whose country can't be determined. */
  readonly unknownMode: RegionMode;
  /** Some country, or an unknown visitor, is not open: paid unlocks are held for someone. */
  readonly holdsPaidUnlocks: boolean;
  /** The mode of a country a person is in; nobody and blanks are open, and `UK` reads as `GB`. */
  modeOf: (country: string | null | undefined) => RegionMode;
}

function normalizeCountry(country: string | null | undefined): string | null {
  if (country === null || country === undefined) return null;
  const code = country.trim().toUpperCase();
  if (code === '') return null;
  return code === 'UK' ? 'GB' : code;
}

export function createRegionPolicy(entries: readonly RegionModeEntry[]): RegionPolicy {
  const regions = new Map<string, RegionMode>();
  let explicitUnknown: RegionMode | null = null;
  for (const { selector, mode } of entries) {
    if (selector === REGION_SELECTOR_UNKNOWN) explicitUnknown = mode;
    else if (selector === REGION_SELECTOR_EU) for (const code of EU_27) regions.set(code, mode);
    else regions.set(selector, mode);
  }
  for (const [code, mode] of regions) if (mode === 'open') regions.delete(code);

  const strictest = [...regions.values()].reduce<RegionMode>(
    (current, mode) => (STRICTNESS[mode] > STRICTNESS[current] ? mode : current),
    'open',
  );
  const unknownMode = explicitUnknown ?? strictest;

  return {
    regions,
    unknownMode,
    holdsPaidUnlocks: regions.size > 0 || unknownMode !== 'open',
    modeOf: (country) => {
      const code = normalizeCountry(country);
      return code === null ? 'open' : (regions.get(code) ?? 'open');
    },
  };
}

/** A policy that restricts nothing: what an unset or unparseable setting means. */
export const OPEN_REGION_POLICY: RegionPolicy = createRegionPolicy([]);
