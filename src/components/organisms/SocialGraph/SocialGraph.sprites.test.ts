import { describe, expect, it } from 'vitest';
import type { NexusGraphPostNode } from '@/services/nexus/graph/graph.types';
import { postGlyph } from './SocialGraph.sprites';

const post = (overrides: Partial<NexusGraphPostNode>): NexusGraphPostNode => ({
  kind: 'post',
  id: 'post:a:1',
  author_id: 'a',
  post_id: '1',
  content: '',
  post_kind: 'short',
  is_reply: false,
  indexed_at: 0,
  ...overrides,
});

describe('postGlyph', () => {
  it('draws top-level posts by content kind', () => {
    expect(postGlyph(post({ post_kind: 'image' }))).toBe('image');
    expect(postGlyph(post({ post_kind: 'short' }))).toBe('short');
  });

  it('draws every reply with the reply glyph, whatever its content kind', () => {
    expect(postGlyph(post({ is_reply: true }))).toBe('reply');
    expect(postGlyph(post({ is_reply: true, post_kind: 'image' }))).toBe('reply');
  });
});
