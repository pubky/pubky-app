import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLocalCursors,
  linkifyPubkys,
  parsePostReference,
  readLocalCursor,
  writeLocalCursor,
} from './capabilities-v1';

const pubky = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';

describe('Pubchi capability helpers', () => {
  afterEach(() => localStorage.clear());

  it('clears only the outgoing owner cursor during an account switch', () => {
    writeLocalCursor(pubky, 'old-cursor');
    writeLocalCursor(`${pubky}other`, 'other-cursor');
    localStorage.setItem('unrelated', 'keep');

    clearLocalCursors(pubky);

    expect(readLocalCursor(pubky)).toBeNull();
    expect(readLocalCursor(`${pubky}other`)).toBe('other-cursor');
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('retains the explicit all-owner cleanup for callers without an owner', () => {
    writeLocalCursor(pubky, 'cursor');
    writeLocalCursor(`${pubky}other`, 'other-cursor');
    clearLocalCursors();
    expect(readLocalCursor(pubky)).toBeNull();
    expect(readLocalCursor(`${pubky}other`)).toBeNull();
  });

  it.each([
    `pubky://${pubky}/pub/pubky.app/posts/post-1`,
    `https://pubky.app/post/${pubky}/post-1`,
    `https://bots.pubky.app/post/${pubky}/post-1`,
  ])('parses %s', (reference) => {
    expect(parsePostReference(reference)).toEqual({
      pubky,
      postId: 'post-1',
      uri: `pubky://${pubky}/pub/pubky.app/posts/post-1`,
    });
  });

  it.each([
    `https://pubky.app/post/${pubky.slice(1)}/post-1`,
    `https://pubky.app/post/${pubky}/post-1 trailing text`,
    `https://pubky.app/post/${pubky}/bad/id`,
  ])('rejects invalid post references: %s', (reference) => {
    expect(parsePostReference(reference)).toBeNull();
  });

  it('linkifies only exact pubkys and leaves text escaped by React', () => {
    expect(linkifyPubkys(`<b>pubky:${pubky}</b>`)).toEqual(['<b>', { pubky, href: `/profile/${pubky}` }, '</b>']);
  });
});
