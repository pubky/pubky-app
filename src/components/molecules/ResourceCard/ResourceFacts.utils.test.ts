import { describe, expect, it } from 'vitest';
import {
  formatAddress,
  formatCategory,
  formatCountry,
  formatDuration,
  formatFactDate,
  formatList,
  formatMinutes,
  formatMoney,
  formatSats,
  getFactLabel,
  getResourceDetailRows,
  getResourceFactRows,
  getResourceSummary,
  type TResourceFactsCard,
} from './ResourceFacts.utils';

const LOCALE = 'en-US';

/** A card of `type` (its path ending in it) with `facts` and the other fields given. */
function card(type: string, facts: Record<string, string>, rest: Partial<TResourceFactsCard> = {}): TResourceFactsCard {
  return { type, type_path: ['Thing', type], facts, ...rest };
}

describe('formatters', () => {
  it.each([
    ['369', '6:09'],
    ['5100', '1:25:00'],
    ['59', '0:59'],
    ['0', null],
    ['x', null],
  ])('formats %s seconds as %s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });

  it.each([
    ['120', '2 h'],
    ['90', '1 h 30 min'],
    ['45', '45 min'],
    ['119.6', '2 h'],
  ])('formats %s minutes as %s', (value, expected) => {
    expect(formatMinutes(value)).toBe(expected);
  });

  it.each([
    ['5770586745', '57.71 BTC'],
    ['500000000', '5 BTC'],
    ['500000', '500,000 sats'],
  ])('formats %s sats as %s', (value, expected) => {
    expect(formatSats(value, LOCALE)).toBe(expected);
  });

  it('formats a price, a free one as Free', () => {
    expect(formatMoney('149', 'USD', LOCALE)).toBe('$149.00');
    expect(formatMoney('0', 'USD', LOCALE)).toBe('Free');
    expect(formatMoney('12', 'NOT-A-CURRENCY', LOCALE)).toBe('12 NOT-A-CURRENCY');
  });

  it('formats full, partial and timed dates, dates without a time in UTC', () => {
    expect(formatFactDate('2023-05-31', LOCALE)).toBe('May 31, 2023');
    expect(formatFactDate('2010-05', LOCALE)).toBe('May 2010');
    expect(formatFactDate('1997', LOCALE)).toBe('1997');
    expect(formatFactDate('2026-09-14T16:15:00-04:00', LOCALE)).toMatch(/^Sep 1[45], 2026$/);
    expect(formatFactDate('soon', LOCALE)).toBeNull();
    expect(formatFactDate('2023-02-31', LOCALE)).toBeNull();
  });

  it('shows the first values of a list and counts the rest', () => {
    expect(formatList('cli; command-line; rust', 2)).toBe('cli, command-line +1');
    expect(formatList('a; b')).toBe('a, b');
    expect(formatList('')).toBeNull();
  });

  it('names a country from its code in either case', () => {
    expect(formatCountry('NL', LOCALE)).toBe('Netherlands');
    expect(formatCountry('ch', LOCALE)).toBe('Switzerland');
  });

  it('writes an address in one line and a category in words', () => {
    expect(
      formatAddress(
        { street: 'Niederdorfstrasse', house_number: '1', postcode: '8001', city: 'Zürich', country_code: 'ch' },
        LOCALE,
      ),
    ).toBe('Niederdorfstrasse 1, 8001 Zürich, Switzerland');
    expect(formatAddress({ city: 'Berlin', country_code: 'de' }, LOCALE)).toBe('Berlin, Germany');
    expect(
      formatAddress(
        {
          street: 'Fremont Street Experience',
          house_number: '1',
          postcode: '89101',
          city: 'Las Vegas',
          country_code: 'us',
        },
        LOCALE,
      ),
    ).toBe('1 Fremont Street Experience, Las Vegas 89101, United States');
    expect(formatAddress({}, LOCALE)).toBeNull();
    expect(formatCategory('amenity/arts_centre')).toBe('Arts centre');
  });
});

describe('getResourceSummary', () => {
  it.each<[string, TResourceFactsCard, string]>([
    [
      'a song: artist, length, album',
      card('MusicRecording', { artist: 'Daft Punk', duration: '369', original_album: 'Random Access Memories' }),
      'Daft Punk · 6:09 · Random Access Memories',
    ],
    [
      'a MusicBrainz artist (a Person): what kind, where',
      card('Person', { artist_type: 'Person', disambiguation: 'frenchcore artist', area: 'Netherlands' }),
      'Frenchcore artist · Netherlands',
    ],
    [
      'a band typed Organization',
      card('Organization', { artist_type: 'Group', country_code: 'GB' }),
      'Group · United Kingdom',
    ],
    [
      'a job: employer, remote regions, when posted',
      card('JobPosting', {
        hiring_organization: 'Strike',
        remote: 'true',
        remote_regions: 'USA',
        date_posted: '2026-09-14',
      }),
      'Strike · Remote (USA) · posted Sep 14, 2026',
    ],
    [
      'a recipe: time, servings, cuisine',
      card('Recipe', { total_minutes: '120', recipe_yield: '6', cuisine: 'Italian' }),
      '2 h · Serves 6 · Italian',
    ],
    [
      'a podcast episode: length and date',
      card('PodcastEpisode', { duration: '2728', published: '2026-10-03T15:30:20+00:00' }),
      '45:28 · Oct 3, 2026',
    ],
    [
      'a block: when mined, pool, transactions',
      card('BitcoinBlock', { pool: 'Braiins Pool', tx_count: '457' }, { start: '2012-11-28T15:24:38Z' }),
      'mined Nov 28, 2012 · Braiins Pool · 457 transactions',
    ],
    [
      'a repository: language, stars, licence',
      card('SoftwareSourceCode', { language: 'Rust', stars: '69695', license: 'Unlicense', updated: '2026-10-27' }),
      'Rust · ★ 69.7K · Unlicense',
    ],
    [
      'a product: price, availability, brand',
      card('Product', { price: '149', price_currency: 'USD', availability: 'in_stock', brand: 'Blockstream' }),
      '$149.00 · In stock · Blockstream',
    ],
    [
      'a trial: status, phases, enrollment',
      card('MedicalTrial', { overall_status: 'COMPLETED', phases: 'PHASE2; PHASE3', enrollment: '46969' }),
      'Completed · Phase 2/3 · 46,969 enrolled',
    ],
    [
      'a deck: cards and languages',
      card('LearningResource', { card_count: '4374', front_lang: 'pt-BR', back_lang: 'en-US' }),
      '4,374 cards · Brazilian Portuguese → American English',
    ],
  ])('says %s', (_, input, expected) => {
    expect(getResourceSummary(input, LOCALE)).toBe(expected);
  });

  it('uses the nearest type in the path that has a summary', () => {
    const cafe: TResourceFactsCard = {
      type: 'CafeOrCoffeeShop',
      type_path: ['Thing', 'Organization', 'Place', 'LocalBusiness', 'FoodEstablishment', 'CafeOrCoffeeShop'],
      address: { street: 'Stegengasse', postcode: '8001', city: 'Zürich', country_code: 'ch' },
    };
    expect(getResourceSummary(cafe, LOCALE)).toBe('Stegengasse, 8001 Zürich, Switzerland');
  });

  it('leaves out what the title or description already says, and has no line without facts', () => {
    const movie = card('Movie', { title_description: '1999 American science fiction action thriller film' });
    expect(getResourceSummary({ ...movie, description: '1999 American science fiction action thriller film' })).toBe(
      null,
    );
    expect(getResourceSummary(card('Article', {}))).toBeNull();
    expect(getResourceSummary({ type: null, type_path: [] })).toBeNull();
  });

  it('leaves out what the title contains, falling through to the next option', () => {
    const report = card('Report', {
      form: '10-Q',
      company: 'Franklin Templeton Digital Holdings Trust',
      filing_date: '2026-08-14',
      period: '2026-06-30',
    });
    expect(
      getResourceSummary({ ...report, name: 'Form 10-Q · Franklin Templeton Digital Holdings Trust' }, LOCALE),
    ).toBe('filed Aug 14, 2026 · period Jun 30, 2026');
    const bird = card('Observation', { common_name: "Brewer's Blackbird", taxon_name: 'Euphagus cyanocephalus' });
    expect(getResourceSummary({ ...bird, name: "Brewer's Blackbird" }, LOCALE)).toBe('Euphagus cyanocephalus');
    // Inside a prefix too: the title's date falls through to the observation's start.
    const dated = { ...bird, facts: { ...bird.facts, observed_on: '2026-09-14' }, start: '2026-09-15T12:00:00Z' };
    expect(getResourceSummary({ ...dated, name: 'Blackbird, Sep 14, 2026' }, LOCALE)).toBe(
      "Brewer's Blackbird · observed Sep 15, 2026",
    );
  });

  it('does not repeat the type label with a bare artist kind', () => {
    expect(getResourceSummary(card('MusicGroup', { artist_type: 'Group' }), LOCALE)).toBeNull();
  });

  it('shows at most three parts', () => {
    const artist = card('MusicGroup', {
      disambiguation: 'band',
      area: 'France',
      begin_date: '1993',
      end_date: '2021',
      genre: 'house; electronic',
    });
    expect(getResourceSummary(artist, LOCALE)).toBe('Band · France · 1993–2021');
  });
});

describe('fact rows', () => {
  it('reads a midnight-UTC time as that day, and leaves out a day a date fact names', () => {
    const trial = {
      type: 'MedicalTrial',
      type_path: ['Thing', 'MedicalTrial'],
      facts: { completion_date: '2023-02-10' },
      start: '2020-04-29T00:00:00Z',
      end: '2023-02-10T00:00:00Z',
    };
    const rows = getResourceDetailRows(trial, { withDates: true }, LOCALE);

    expect(rows.map(({ label, value }) => `${label}: ${value}`)).toEqual([
      'Started: Apr 29, 2020',
      'Completion date: Feb 10, 2023',
    ]);
  });

  it('leaves out a time whose day a date fact already names, in the source’s own calendar', () => {
    const bird = {
      type: 'Observation',
      type_path: ['Thing', 'Observation'],
      facts: { observed_on: '2026-01-01' },
      start: '2026-01-01T23:09:23Z',
    };
    const rows = getResourceDetailRows(bird, { withDates: true }, LOCALE);

    expect(rows.map((row) => row.label)).toEqual(['Observed']);
    expect(rows[0].key).toBe('observed_on');
  });

  it('compares a time with an offset by the day the source wrote', () => {
    const bird = {
      type: 'Observation',
      type_path: ['Thing', 'Observation'],
      facts: { observed_on: '2026-01-01' },
      start: '2026-01-01T20:00:00-08:00',
    };
    expect(getResourceDetailRows(bird, { withDates: true }, LOCALE).map((row) => row.key)).toEqual(['observed_on']);
  });

  it('adds units to measures and leaves out a value that repeats the title', () => {
    const rows = getResourceFactRows(
      {
        name: 'The Matrix',
        facts: { title: 'The Matrix', size: '989323', median_fee_rate: '62.0', molecular_weight_kda: '438.26' },
      },
      LOCALE,
    );
    expect(rows.map(({ label, value }) => `${label}: ${value}`)).toEqual([
      'Size: 989,323 bytes',
      'Median fee rate: 62.0 sat/vB',
      'Molecular weight: 438.26 kDa',
    ]);
  });

  it('labels and formats known facts, words unknown ones, and leaves ids out', () => {
    const rows = getResourceFactRows(
      card('BitcoinAddress', {
        balance: '5770586745',
        tx_count: '67323',
        page_url: 'https://mempool.space/address/1A1z',
        mbid: 'x',
        brand_new_fact: 'a; b',
        website: 'https://example.org',
        isrc: 'USQX91300108',
      }),
      LOCALE,
    );
    expect(rows.map(({ label, value, href }) => [label, value, href])).toEqual([
      ['Balance', '57.71 BTC', null],
      ['Transactions', '67,323', null],
      ['Brand new fact', 'a, b', null],
      ['Website', 'https://example.org', 'https://example.org'],
      ['ISRC', 'USQX91300108', null],
    ]);
  });

  it('never links a value that is not http(s)', () => {
    const [row] = getResourceFactRows(card('Thing', { link: 'javascript:alert(1)' }));
    expect(row.href).toBeNull();
  });

  it('names a key in words, acronyms upper case', () => {
    expect(getFactLabel('hiring_organization')).toBe('Hiring organization');
    expect(getFactLabel('molecular_weight_kda')).toBe('Molecular weight');
    expect(getFactLabel('some_new_ids')).toBe('Some new IDs');
    expect(getFactLabel('pdb_ids')).toBe('PDB IDs');
  });

  it('puts where and when first on the page, with a map link for the point', () => {
    const rows = getResourceDetailRows(
      {
        type: 'BitcoinBlock',
        type_path: ['Thing', 'BitcoinBlock'],
        facts: { pool: 'BTCC' },
        address: { city: 'Zürich', country_code: 'ch' },
        category: 'amenity/cafe',
        point: { lat: 47.37, lon: 8.54 },
        start: '2017-08-24T01:57:37Z',
        end: null,
      },
      { withDates: true },
      LOCALE,
    );
    expect(rows.map((row) => row.label)).toEqual(['Address', 'Kind', 'Map', 'Mined', 'Pool']);
    expect(rows[2].href).toBe('https://www.openstreetmap.org/?mlat=47.37000&mlon=8.54000#map=17/47.37000/8.54000');
  });
});
