import { describe, expect, it } from 'vitest';
import kindOfBlueEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-release-group.enriched.json';
import kindOfBlueFixture from '@/services/pinakes/fixtures/by-uri.mb-release-group.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asInvalid } from '@/test-utils/type-assertions';
import { normalizePinakesCredits, withNormalizedCredits } from './pinakes.credits';

const CREDIT = {
  field: 'image',
  provider: 'wikimedia_commons',
  source_url: 'https://commons.wikimedia.org/wiki/File:Daft_Punk_in_2013.jpg',
  author: 'Sony Music Entertainment',
  license: 'CC-BY-4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  lang: null,
  excerpted: false,
  modified: false,
  subject: null,
};

describe('normalizePinakesCredits', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', []],
    ['not an array', { field: 'image' }],
    ['a string', 'wikipedia'],
  ])('reads %s credits as none', (_, credits) => {
    expect(normalizePinakesCredits(credits)).toEqual([]);
  });

  it('keeps a valid credit as it is', () => {
    expect(normalizePinakesCredits([CREDIT])).toEqual([CREDIT]);
  });

  it.each([
    ['not an object', 'wikipedia'],
    ['null', null],
    ['an array', [CREDIT]],
    ['without field', { ...CREDIT, field: undefined }],
    ['without provider', { ...CREDIT, provider: undefined }],
    ['without source_url', { ...CREDIT, source_url: undefined }],
    ['with a blank source_url', { ...CREDIT, source_url: '  ' }],
    ['with a number for field', { ...CREDIT, field: 1 }],
  ])('drops an entry %s', (_, entry) => {
    expect(normalizePinakesCredits([entry, CREDIT])).toEqual([CREDIT]);
  });

  it('reads optional fields of the wrong type as absent', () => {
    expect(
      normalizePinakesCredits([
        {
          field: 'description',
          provider: 'wikipedia',
          source_url: 'https://en.wikipedia.org/wiki/X',
          author: 3,
          excerpted: 'yes',
        },
      ]),
    ).toEqual([
      {
        field: 'description',
        provider: 'wikipedia',
        source_url: 'https://en.wikipedia.org/wiki/X',
        author: null,
        license: null,
        license_url: null,
        lang: null,
        excerpted: false,
        modified: false,
        subject: null,
      },
    ]);
  });

  it('keeps unknown fields, providers and URL schemes: the renderer decides what to show', () => {
    const entry = { ...CREDIT, field: 'name', provider: 'other', source_url: 'javascript:alert(1)' };

    expect(normalizePinakesCredits([entry])).toEqual([entry]);
  });
});

describe('withNormalizedCredits', () => {
  it('returns a stable card without credits as it is', () => {
    const card: TPinakesResourceDetail = kindOfBlueFixture;

    expect(withNormalizedCredits(card)).toBe(card);
    expect(withNormalizedCredits({ ...card, credits: null }).credits).toBeNull();
  });

  it('validates the credits of an enriched card', () => {
    const card: TPinakesResourceDetail = {
      ...kindOfBlueEnrichedFixture,
      credits: asInvalid([{}, ...(kindOfBlueEnrichedFixture.credits ?? [])]),
    };

    expect(withNormalizedCredits(card)).toEqual(kindOfBlueEnrichedFixture);
  });
});
