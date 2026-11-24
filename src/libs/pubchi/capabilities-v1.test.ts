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
    `pubky://${pubky}/pub/pubky.app/posts/0032W6CBGDBP0`,
    `pubky://${pubky}/pub/social/v1/posts/0032W6CBGDBP0`,
    `https://pubky.app/post/${pubky}/0032W6CBGDBP0`,
    `https://bots.pubky.app/post/${pubky}/0032W6CBGDBP0`,
  ])('parses %s', (reference) => {
    expect(parsePostReference(reference)).toEqual({
      pubky,
      postId: '0032W6CBGDBP0',
      uri: `pubky://${pubky}/pub/social/v1/posts/0032W6CBGDBP0`,
    });
  });

  it.each([
    `https://pubky.app/post/${pubky.slice(1)}/0032W6CBGDBP0`,
    `https://pubky.app/post/${pubky}/0032W6CBGDBP0 trailing text`,
    `https://pubky.app/post/${pubky}/bad/id`,
  ])('rejects invalid post references: %s', (reference) => {
    expect(parsePostReference(reference)).toBeNull();
  });

  it('linkifies only exact pubkys and leaves text escaped by React', () => {
    expect(linkifyPubkys(`<b>pubky:${pubky}</b>`)).toEqual(['<b>', { pubky, href: `/profile/${pubky}` }, '</b>']);
  });
});
