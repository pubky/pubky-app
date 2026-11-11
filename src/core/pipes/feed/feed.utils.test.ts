import { buildFeed, type NewFeed } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { normalizeTagList } from './feed.utils';

describe('normalizeTagList', () => {
  const owner = fakeOwner(1);
  const filter = (tags: string[]): NewFeed => ({
    name: 'Contract',
    icon: 'activity',
    tags,
    domain_tags: null,
    reach: 'all',
    layout: 'columns',
    sort: 'recent',
    content: null,
  });

  it('trims, dedupes and drops blank labels', () => {
    expect(normalizeTagList([' Lightning ', 'BITCOIN', 'bitcoin', '  ', ''])).toEqual(['lightning', 'bitcoin']);
    expect(normalizeTagList(undefined)).toEqual([]);
    expect(normalizeTagList(null)).toEqual([]);
  });

  // Contract with `buildFeed`: the package folds the filter again when it builds the feed, so a list the
  // app folded first must come out byte-identical, or the id the app hashes is not the one spec-folding
  // clients compute for the same labels.
  it.each([
    ['ASCII labels', [' Lightning ', 'BITCOIN', 'bitcoin']],
    ['a non-ASCII capital', ['Äpfel', 'rust']],
    ['labels that only Unicode case folding would merge', ['Äpfel', 'äpfel', 'İstanbul', 'Café']],
    // U+FEFF is outside the data model's frozen whitespace set, so it is part of the label (String.prototype.trim would drop it).
    ['a label with a leading BOM', ['\uFEFFbitcoin', 'bitcoin']],
  ])('agrees with the fold buildFeed applies for %s', (_name, labels) => {
    const folded = buildFeed(owner, filter(labels)).object.feed.tags;

    expect([...normalizeTagList(labels)].sort()).toEqual([...(folded ?? [])].sort());
    expect(buildFeed(owner, filter(normalizeTagList(labels))).id).toBe(buildFeed(owner, filter(labels)).id);
  });
});
