import { describe, expect, it } from 'vitest';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import type { TPinakesCredit, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import {
  getCreditProviderName,
  getCreditSubjectLabel,
  getLicenseLabel,
  getShownCredits,
} from './ResourceCredits.utils';

const MB_GROUP: TPinakesResourceDetail = mbGroupEnrichedFixture;
const [TEXT_CREDIT, IMAGE_CREDIT]: TPinakesCredit[] = MB_GROUP.credits ?? [];

describe('getShownCredits', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', []],
  ])('shows no credits when they are %s', (_, credits) => {
    expect(getShownCredits({ description: 'Text', credits }, { imageShown: true })).toEqual([]);
  });

  it('lists the text’s credit first, then the image’s', () => {
    const card = { ...mbGroupEnrichedFixture, credits: [IMAGE_CREDIT, TEXT_CREDIT] };

    expect(getShownCredits(card, { imageShown: true })).toEqual([TEXT_CREDIT, IMAGE_CREDIT]);
  });

  it('leaves out the image’s credit when the image is not shown', () => {
    expect(getShownCredits(mbGroupEnrichedFixture, { imageShown: false })).toEqual([TEXT_CREDIT]);
  });

  it('leaves out the text’s credit when the card has no description', () => {
    expect(getShownCredits({ ...mbGroupEnrichedFixture, description: null }, { imageShown: true })).toEqual([
      IMAGE_CREDIT,
    ]);
  });

  it('ignores a credit for a field the card does not show', () => {
    const card = { ...mbGroupEnrichedFixture, credits: [{ ...TEXT_CREDIT, field: 'name' }] };

    expect(getShownCredits(card, { imageShown: true })).toEqual([]);
  });
});

describe('getLicenseLabel', () => {
  it.each([
    ['CC-BY-SA-4.0', 'CC BY-SA 4.0'],
    ['CC-BY-4.0', 'CC BY 4.0'],
    ['cc-by-nc-sa-2.5', 'CC BY-NC-SA 2.5'],
    ['CC0-1.0', 'CC0 1.0'],
    ['public-domain', 'Public domain'],
    ['GFDL-1.3', 'GFDL-1.3'],
    ['CC-BY-SA-3.0-IGO', 'CC-BY-SA-3.0-IGO'],
  ])('names %s as %s', (id, label) => {
    expect(getLicenseLabel(id)).toBe(label);
  });

  it.each([null, undefined, '', ' '])('has no label for %j', (id) => {
    expect(getLicenseLabel(id)).toBeNull();
  });
});

describe('getCreditProviderName', () => {
  it('names the known providers', () => {
    expect(getCreditProviderName(TEXT_CREDIT)).toBe('Wikipedia');
    expect(getCreditProviderName(IMAGE_CREDIT)).toBe('Wikimedia Commons');
  });

  it('names an unknown provider by its source’s host, else as given', () => {
    expect(getCreditProviderName({ provider: 'discogs', source_url: 'https://www.discogs.com/artist/1' })).toBe(
      'discogs.com',
    );
    expect(getCreditProviderName({ provider: 'archive', source_url: 'ark:/13030/tf5p30086k' })).toBe('archive');
  });
});

describe('getCreditSubjectLabel', () => {
  it('names a MusicBrainz entity by its kind', () => {
    expect(getCreditSubjectLabel('https://musicbrainz.org/work/41c94a08-a551-3c86-bb17-d9a52e3a618b')).toBe(
      'its MusicBrainz work',
    );
    expect(getCreditSubjectLabel('https://musicbrainz.org/release-group/8e8a594f')).toBe(
      'its MusicBrainz release group',
    );
  });

  it('names another web subject by its host, and has no label for a non-web one', () => {
    expect(getCreditSubjectLabel('https://www.wikidata.org/wiki/Q187745')).toBe('a related page on wikidata.org');
    expect(getCreditSubjectLabel('javascript:alert(1)')).toBeNull();
    expect(getCreditSubjectLabel(null)).toBeNull();
  });
});
