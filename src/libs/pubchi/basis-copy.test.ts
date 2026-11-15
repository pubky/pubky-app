import { describe, expect, it } from 'vitest';
import { PUBCHI_BASIS_HEADING_DEFAULT, PUBCHI_BASIS_HEADINGS, pubchiBasisHeading } from './basis-copy';
import { PUBCHI_ANSWER_BASIS } from './schemas/answer';

describe('pubchiBasisHeading', () => {
  it.each(PUBCHI_ANSWER_BASIS)('maps %s to the App heading', (basis) => {
    expect(pubchiBasisHeading(basis)).toBe(PUBCHI_BASIS_HEADINGS[basis]);
  });

  it('maps an unknown basis to the model heading instead of failing closed', () => {
    expect(pubchiBasisHeading('corpus-v2')).toBe(PUBCHI_BASIS_HEADING_DEFAULT);
    expect(pubchiBasisHeading('corpus-v2')).toBe('From what I know');
  });
});
