import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCK_TITLE } from './lockTeaser';
import { deriveTextPreview } from './postPreview';

const LOCK_URL = 'pubky://hs/pub/app.locks/lock1.json';

describe('deriveTextPreview', () => {
  it('returns the deleted notice for a deleted post regardless of kind', () => {
    expect(deriveTextPreview({ content: '[DELETED]', kind: 'short', lock: null, deleted: false })).toBe(
      'This post has been deleted by its author.',
    );
    expect(deriveTextPreview({ content: '[DELETED]', kind: 'long', lock: null, deleted: false })).toBe(
      'This post has been deleted by its author.',
    );
  });

  it('returns the deleted notice for a Nexus-shaped tombstone (empty content, flag set)', () => {
    expect(deriveTextPreview({ content: '', kind: 'short', lock: null, deleted: true })).toBe(
      'This post has been deleted by its author.',
    );
    expect(deriveTextPreview({ content: '', kind: 'long', lock: null, deleted: true })).toBe(
      'This post has been deleted by its author.',
    );
  });

  it('does not treat empty content as deleted when the flag is not set', () => {
    expect(deriveTextPreview({ content: '', kind: 'short', lock: null, deleted: false })).toBe('');
  });

  it('returns the parsed article title for a long post', () => {
    const content = JSON.stringify({ title: 'My Article', body: 'Body text' });
    expect(deriveTextPreview({ content, kind: 'long', lock: null, deleted: false })).toBe('My Article');
  });

  it('falls back to raw content for a long post with unparseable content', () => {
    expect(deriveTextPreview({ content: 'plain text', kind: 'long', lock: null, deleted: false })).toBe('plain text');
  });

  it('returns the parsed collection name for a collection post', () => {
    const content = JSON.stringify({ name: 'My Collection' });
    expect(deriveTextPreview({ content, kind: 'collection', lock: null, deleted: false })).toBe('My Collection');
  });

  it('falls back to raw content for a collection post with unparseable content', () => {
    expect(deriveTextPreview({ content: 'plain text', kind: 'collection', lock: null, deleted: false })).toBe(
      'plain text',
    );
  });

  it('returns the lock title for a lock announcement', () => {
    const content = JSON.stringify({ lock_title: 'BBC', teaser_description: 'A peek' });
    expect(deriveTextPreview({ content, kind: 'short', lock: LOCK_URL, deleted: false })).toBe('BBC');
  });

  // `LockedPostCard` labels a title-less lock the same way; the two must not disagree.
  it('falls back to the default lock title when a lock announcement has no title', () => {
    const content = JSON.stringify({ lock_title: '', teaser_description: 'A peek' });
    expect(deriveTextPreview({ content, kind: 'short', lock: LOCK_URL, deleted: false })).toBe(DEFAULT_LOCK_TITLE);
  });

  it('falls back to the default lock title when a lock announcement carries no text', () => {
    const content = JSON.stringify({ lock_title: '', teaser_description: '' });
    expect(deriveTextPreview({ content, kind: 'short', lock: LOCK_URL, deleted: false })).toBe(DEFAULT_LOCK_TITLE);
  });

  it('ignores a whitespace-only lock title', () => {
    const content = JSON.stringify({ lock_title: '   ', teaser_description: 'A peek' });
    expect(deriveTextPreview({ content, kind: 'short', lock: LOCK_URL, deleted: false })).toBe(DEFAULT_LOCK_TITLE);
  });

  it('keeps a locked article on the article branch when its content is not a teaser envelope', () => {
    const content = JSON.stringify({ title: 'My Article', body: 'Body text' });
    expect(deriveTextPreview({ content, kind: 'long', lock: LOCK_URL, deleted: false })).toBe('My Article');
  });

  it('falls back to raw content when a lock announcement will not parse', () => {
    expect(deriveTextPreview({ content: 'plain text', kind: 'short', lock: LOCK_URL, deleted: false })).toBe(
      'plain text',
    );
  });

  it('reports a deleted lock announcement as deleted', () => {
    expect(deriveTextPreview({ content: '[DELETED]', kind: 'short', lock: LOCK_URL, deleted: false })).toBe(
      'This post has been deleted by its author.',
    );
  });

  it('leaves a post without a lock url untouched, whatever its content looks like', () => {
    const content = JSON.stringify({ lock_title: 'BBC', teaser_description: 'A peek' });
    expect(deriveTextPreview({ content, kind: 'short', lock: null, deleted: false })).toBe(content);
  });

  it('returns raw content for other kinds', () => {
    expect(deriveTextPreview({ content: 'hello', kind: 'short', lock: null, deleted: false })).toBe('hello');
    expect(deriveTextPreview({ content: 'hello', kind: 'image', lock: null, deleted: false })).toBe('hello');
    expect(deriveTextPreview({ content: 'https://x.test', kind: 'link', lock: null, deleted: false })).toBe(
      'https://x.test',
    );
  });
});
