import { describe, expect, it } from 'vitest';
import type { TMergedTag } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import { getTagPeople } from './ResourceTagBar.utils';

const DEEZER = { uri: 'https://www.deezer.com/track/67238735', name: 'Deezer' };
const TIDAL = { uri: 'https://tidal.com/track/490851477', name: 'TIDAL' };

// `dance` on the same song's Deezer and TIDAL links (`mergeOtherLinkTags`): bob on both, cy on TIDAL.
const DANCE: TMergedTag = {
  label: 'dance',
  taggers: ['bob', 'cy', 'ann'],
  count: 3,
  isComplete: true,
  sources: [
    { ...TIDAL, count: 2, taggers: ['bob', 'cy'] },
    { ...DEEZER, count: 2, taggers: ['bob', 'ann'] },
  ],
};

describe('getTagPeople', () => {
  it('lists the link’s own taggers first, then the people only on other links, each once with their links', () => {
    const people = getTagPeople({ taggers: ['ann', 'dee'], taggers_count: 2 }, DANCE);

    expect(people.here).toEqual([
      { id: 'ann', links: [DEEZER] },
      { id: 'dee', links: [] },
    ]);
    expect(people.elsewhere).toEqual([
      { id: 'bob', links: [TIDAL, DEEZER] },
      { id: 'cy', links: [TIDAL] },
    ]);
    // ann, dee, bob, cy: a person on both sides counts once.
    expect(people.total).toBe(4);
    expect(people.isComplete).toBe(true);
  });

  it('has no one here for a label only the other links have', () => {
    const people = getTagPeople(undefined, DANCE);

    expect(people.here).toEqual([]);
    expect(people.elsewhere.map((person) => person.id)).toEqual(['bob', 'cy', 'ann']);
    expect(people.total).toBe(3);
  });

  it('counts at least what Nexus counts when it lists fewer taggers than it counts', () => {
    const own = getTagPeople({ taggers: ['ann'], taggers_count: 9 }, DANCE);
    expect(own.total).toBe(9);
    expect(own.isComplete).toBe(false);

    const elsewhere = getTagPeople({ taggers: ['ann'], taggers_count: 1 }, { ...DANCE, count: 12, isComplete: false });
    expect(elsewhere.total).toBe(12);
    expect(elsewhere.isComplete).toBe(false);
  });

  it('is not complete when the link’s own read lists fewer taggers than it counts', () => {
    const people = getTagPeople({ taggers: ['ann'], taggers_count: 6 }, DANCE);
    expect(people.total).toBe(6);
    expect(people.isComplete).toBe(false);
    expect(people.elsewhere.map((person) => person.id)).toEqual(['bob', 'cy']);
  });

  it('lists a tagger the own read repeats once', () => {
    expect(getTagPeople({ taggers: ['ann', 'ann'], taggers_count: 1 }, DANCE).here).toHaveLength(1);
  });
});
