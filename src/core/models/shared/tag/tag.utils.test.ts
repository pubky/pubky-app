import { describe, expect, it } from 'vitest';
import type { NexusTag } from '@/services/nexus/nexus.types';
import type { TagCollectionModelSchema, TagMutation } from './tag.schema';
import { getViewerTagUri } from './tag.utils';

const NOW = 1_000_000;
const NEXUS_URI = 'pubky://viewer/pub/mapky/tags/MAPKY01';
const LOCAL_URI = 'pubky://viewer/pub/pubky.app/tags/LOCAL01';

const mutation = (overrides: Partial<TagMutation> = {}): TagMutation => ({
  id: 'operation',
  label: 'bitcoin',
  viewerId: 'viewer',
  relationship: true,
  synced: true,
  expiresAt: NOW + 1,
  uri: LOCAL_URI,
  ...overrides,
});

const record = ({
  viewerId = 'viewer' as string | null,
  tag = {} as Partial<NexusTag>,
  pending = undefined as TagMutation | undefined,
} = {}): TagCollectionModelSchema<string> => ({
  id: 'author:post',
  tags: [{ label: 'Bitcoin', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: NEXUS_URI, ...tag }],
  cache: { cursor: 1, exhausted: true, fetchedAt: 1, revision: 1, viewerId },
  ...(pending && { mutations: { 'viewer:bitcoin': pending } }),
});

describe('getViewerTagUri', () => {
  it('uses the Nexus tag_uri of the viewer row, matching the label case-insensitively', () => {
    expect(getViewerTagUri(record(), 'BITCOIN', 'viewer', NOW)).toBe(NEXUS_URI);
  });

  it('prefers the address a pending local create wrote', () => {
    expect(getViewerTagUri(record({ pending: mutation() }), 'bitcoin', 'viewer', NOW)).toBe(LOCAL_URI);
  });

  it('falls back to Nexus when a pending create predates the stored address', () => {
    expect(getViewerTagUri(record({ pending: mutation({ uri: undefined }) }), 'bitcoin', 'viewer', NOW)).toBe(
      NEXUS_URI,
    );
  });

  it('reports nothing while a local delete is pending', () => {
    const pending = mutation({ relationship: false, uri: undefined });
    expect(getViewerTagUri(record({ pending }), 'bitcoin', 'viewer', NOW)).toBeUndefined();
  });

  it('prefers Nexus over an expired create, which it only uses when Nexus has no address', () => {
    const pending = mutation({ expiresAt: NOW });
    expect(getViewerTagUri(record({ pending }), 'bitcoin', 'viewer', NOW)).toBe(NEXUS_URI);
    expect(
      getViewerTagUri(record({ pending, tag: { tag_uri: null, relationship: false } }), 'bitcoin', 'viewer', NOW),
    ).toBe(LOCAL_URI);
  });

  it.each([
    ['another viewer', record({ viewerId: 'other' })],
    ['a guest response', record({ viewerId: null })],
    ['a row the viewer no longer tags', record({ tag: { relationship: false } })],
    ['a row cached before tag_uri', record({ tag: { tag_uri: undefined } })],
    ['a missing record', null],
  ])('reports nothing for %s', (_case, row) => {
    expect(getViewerTagUri(row, 'bitcoin', 'viewer', NOW)).toBeUndefined();
  });
});
