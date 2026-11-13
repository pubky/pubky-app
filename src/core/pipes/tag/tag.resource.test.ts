import { describe, expect, it } from 'vitest';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { mergeResourceTags, withResourceViewerListed, withResourceViewerTag } from './tag.resource';

const VIEWER = 'viewer-pubky';
const TAG_URI = `pubky://${VIEWER}/pub/social/v1/tags/ABC.json`;
// The tags of a Nexus `GET /v1/resource/by-uri` answer (OSM node 240109189).
const TAGS: NexusTag[] = [
  { label: 'berlin', taggers: ['a', 'b', 'c'], taggers_count: 3, relationship: false, tag_uri: null },
  { label: 'city', taggers: [VIEWER], taggers_count: 1, relationship: true, tag_uri: TAG_URI },
];

describe('withResourceViewerTag', () => {
  it('adds the viewer to a label others hold, first among its taggers', () => {
    const [berlin] = withResourceViewerTag(TAGS, { label: 'Berlin', viewerId: VIEWER, tagUri: TAG_URI }, true);

    expect(berlin).toEqual({
      label: 'berlin',
      taggers: [VIEWER, 'a', 'b', 'c'],
      taggers_count: 4,
      relationship: true,
      tag_uri: TAG_URI,
    });
  });

  it('appends a new label with the viewer as its only tagger', () => {
    const next = withResourceViewerTag(TAGS, { label: 'travel', viewerId: VIEWER }, true);

    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({
      label: 'travel',
      taggers: [VIEWER],
      taggers_count: 1,
      relationship: true,
      tag_uri: null,
    });
  });

  it('leaves a label the viewer already holds as it is', () => {
    expect(withResourceViewerTag(TAGS, { label: 'city', viewerId: VIEWER }, true)).toEqual(TAGS);
  });

  it('drops a removed label nobody else holds', () => {
    expect(withResourceViewerTag(TAGS, { label: 'city', viewerId: VIEWER }, false)).toEqual([TAGS[0]]);
  });

  it('takes the viewer out of a label others still hold', () => {
    const tags: NexusTag[] = [
      { label: 'berlin', taggers: [VIEWER, 'a'], taggers_count: 2, relationship: true, tag_uri: TAG_URI },
    ];

    expect(withResourceViewerTag(tags, { label: 'berlin', viewerId: VIEWER }, false)).toEqual([
      { label: 'berlin', taggers: ['a'], taggers_count: 1, relationship: false, tag_uri: null },
    ]);
  });

  it('leaves a label the viewer does not hold when removing', () => {
    expect(withResourceViewerTag(TAGS, { label: 'berlin', viewerId: VIEWER }, false)).toEqual(TAGS);
  });
});

describe('withResourceViewerListed', () => {
  const tag = (label: string, taggers: string[], taggersCount: number, relationship: boolean): NexusTag => ({
    label,
    taggers,
    taggers_count: taggersCount,
    relationship,
    tag_uri: null,
  });

  it('puts the viewer first among the taggers of a tag marked theirs that Nexus’ sample left them out of', () => {
    const tags = [tag('rock', ['a', 'b'], 7, true), tag('jazz', ['a'], 1, false), tag('pop', [VIEWER], 1, true)];

    expect(withResourceViewerListed(tags, VIEWER)).toEqual([
      tag('rock', [VIEWER, 'a', 'b'], 7, true),
      tag('jazz', ['a'], 1, false),
      tag('pop', [VIEWER], 1, true),
    ]);
  });

  it('changes nothing signed out', () => {
    const tags = [tag('rock', ['a'], 3, true)];
    expect(withResourceViewerListed(tags, null)).toEqual(tags);
  });
});

describe('mergeResourceTags', () => {
  const tag = (label: string, taggers: string[], extra: Partial<NexusTag> = {}): NexusTag => ({
    label,
    taggers,
    taggers_count: taggers.length,
    relationship: false,
    tag_uri: null,
    ...extra,
  });

  it('counts one tagger on each of two spellings twice, the same tagger on both once', () => {
    const merged = mergeResourceTags([
      [tag('punk', ['a']), tag('sum41', ['a'])],
      [tag('punk', ['b']), tag('Sum41', ['a'])],
    ]);

    expect(merged.find((entry) => entry.label === 'punk')).toMatchObject({ taggers: ['a', 'b'], taggers_count: 2 });
    expect(merged.find((entry) => entry.label === 'sum41')).toMatchObject({ taggers: ['a'], taggers_count: 1 });
  });

  it('shows the viewer’s tag on any spelling as theirs, with that spelling’s file', () => {
    const merged = mergeResourceTags([
      [tag('punk', ['a'])],
      [tag('punk', [VIEWER], { relationship: true, tag_uri: TAG_URI })],
    ]);

    expect(merged).toEqual([
      { label: 'punk', taggers: ['a', VIEWER], taggers_count: 2, relationship: true, tag_uri: TAG_URI },
    ]);
  });

  it('keeps a count Nexus did not list every tagger for, most taggers first', () => {
    const merged = mergeResourceTags([
      [tag('rock', ['a'])],
      [tag('punk', ['b', 'c'], { taggers_count: 7 }), tag('rock', ['b'])],
    ]);

    expect(merged.map((entry) => [entry.label, entry.taggers_count])).toEqual([
      ['punk', 7],
      ['rock', 2],
    ]);
  });

  it('leaves out a label that is empty once folded', () => {
    expect(mergeResourceTags([[tag(' ', ['a'])], [tag('punk', ['b']), tag('', ['c'])]])).toEqual([tag('punk', ['b'])]);
  });

  it('returns a single read as it is', () => {
    expect(mergeResourceTags([TAGS])).toEqual(TAGS);
  });
});
