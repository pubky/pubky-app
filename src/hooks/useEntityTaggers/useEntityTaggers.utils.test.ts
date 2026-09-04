import { describe, expect, it } from 'vitest';
import { mergeTaggerIds } from './useEntityTaggers.utils';

describe('mergeTaggerIds', () => {
  it('returns the preview before anything was fetched', () => {
    expect(mergeTaggerIds({ previewIds: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('puts fetched ids first and appends preview ids Nexus has not returned yet', () => {
    expect(mergeTaggerIds({ fetchedIds: ['a', 'b', 'c'], previewIds: ['b', 'new'] })).toEqual(['a', 'b', 'c', 'new']);
  });

  it('adds the viewer when they tag the entity but are missing from both lists', () => {
    expect(mergeTaggerIds({ fetchedIds: ['a'], previewIds: ['a'], viewerId: 'viewer', isViewerTagger: true })).toEqual([
      'a',
      'viewer',
    ]);
  });

  it('removes the viewer from stale fetched ids when they no longer tag the entity', () => {
    expect(
      mergeTaggerIds({ fetchedIds: ['a', 'viewer'], previewIds: [], viewerId: 'viewer', isViewerTagger: false }),
    ).toEqual(['a']);
  });

  it('leaves the viewer alone when the relationship is unknown', () => {
    expect(mergeTaggerIds({ fetchedIds: ['viewer'], previewIds: [], viewerId: 'viewer' })).toEqual(['viewer']);
  });

  it('ignores the relationship without a viewer', () => {
    expect(mergeTaggerIds({ fetchedIds: ['a'], previewIds: [], viewerId: null, isViewerTagger: true })).toEqual(['a']);
  });
});
