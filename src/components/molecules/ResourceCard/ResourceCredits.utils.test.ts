import { describe, expect, it } from 'vitest';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import type { TPinakesCredit, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import {
  getCardAttribution,
  getCreditProviderName,
  getCreditSubjectLabel,
  getLicenseLabel,
  getMapDataCredit,
  getShownCredits,
  isCreditRequired,
} from './ResourceCredits.utils';

const MB_GROUP: TPinakesResourceDetail = mbGroupEnrichedFixture;
const [TEXT_CREDIT, IMAGE_CREDIT]: TPinakesCredit[] = MB_GROUP.credits ?? [];

const OSM = '© OpenStreetMap contributors (ODbL)';
const ZONE = 'Timezone Boundary Builder / OpenStreetMap contributors (ODbL-1.0), tzf-rel 2025c';
const FEDLEX = 'Source: Fedlex, www.fedlex.admin.ch';

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

describe('getCardAttribution', () => {
  it('leaves out OpenStreetMap’s credit, and keeps another source’s', () => {
    expect(getCardAttribution(OSM)).toBeNull();
    expect(getCardAttribution(`${OSM}; ${ZONE}`)).toBeNull();
    expect(getCardAttribution(FEDLEX)).toBe(FEDLEX);
    expect(getCardAttribution(`${FEDLEX}; ${OSM}`)).toBe(FEDLEX);
  });

  it('leaves out a credit no licence asks for: CC0, a Public Domain Mark, public-domain sources', () => {
    for (const attribution of [
      'RCSB PDB (CC0 1.0)',
      'Research Organization Registry (CC0)',
      'PubChem (NCBI)',
      'U.S. Geological Survey',
      'The Metropolitan Museum of Art, CC0',
      'A. Person, no rights reserved (CC0), via iNaturalist',
      'Public Domain Mark 1.0',
    ]) {
      expect(getCardAttribution(attribution)).toBeNull();
    }
    expect(getCardAttribution(`RCSB PDB (CC0 1.0); ${FEDLEX}`)).toBe(FEDLEX);
  });

  it('keeps a credit a licence or the source’s terms ask for', () => {
    for (const attribution of [
      FEDLEX,
      '© European Union, https://eur-lex.europa.eu',
      'UniProt (CC BY 4.0)',
      '(c) A. Person, some rights reserved (CC BY-NC), via iNaturalist',
      'The Metropolitan Museum of Art',
      'Grayliptrot / Public domain',
    ]) {
      expect(getCardAttribution(attribution)).toBe(attribution);
    }
  });

  it('has none for a card without one', () => {
    expect(getCardAttribution(null)).toBeNull();
    expect(getCardAttribution(undefined)).toBeNull();
    expect(getCardAttribution(' ')).toBeNull();
  });
});

describe('isCreditRequired', () => {
  it('asks for every credit but a CC0 one', () => {
    expect(isCreditRequired({ license: 'CC0-1.0' })).toBe(false);
    expect(isCreditRequired({ license: 'CC-BY-SA-4.0' })).toBe(true);
    expect(isCreditRequired({ license: 'public-domain' })).toBe(true);
    expect(isCreditRequired({ license: null })).toBe(true);
  });
});

describe('getMapDataCredit', () => {
  it('credits OpenStreetMap once, linked to its copyright page, for a place, an event or a time zone', () => {
    for (const attribution of [OSM, ZONE, `${OSM}; ${ZONE}`, `${FEDLEX}; ${OSM}`]) {
      expect(getMapDataCredit(attribution)).toEqual({
        field: 'map',
        provider: 'openstreetmap',
        source_url: 'https://www.openstreetmap.org/copyright',
      });
    }
    const credit = getMapDataCredit(OSM);
    expect(credit && getCreditProviderName(credit)).toBe('OpenStreetMap');
  });

  it('has none for a card OpenStreetMap does not credit', () => {
    expect(getMapDataCredit(FEDLEX)).toBeNull();
    expect(getMapDataCredit(null)).toBeNull();
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
