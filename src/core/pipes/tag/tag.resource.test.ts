import { describe, expect, it } from 'vitest';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { withResourceViewerTag } from './tag.resource';

const VIEWER = 'viewer-pubky';
const TAG_URI = `pubky://${VIEWER}/pub/social/v1/tags/ABC.json`;
// The tags of a Nexus `GET /v0/resource/by-uri` answer (OSM node 240109189).
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
