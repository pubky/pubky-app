import { describe, expect, it } from 'vitest';
import { deriveTextPreview } from './postPreview';

describe('deriveTextPreview', () => {
  it('returns the deleted notice for a deleted post regardless of kind', () => {
    expect(deriveTextPreview({ content: '[DELETED]', kind: 'short' })).toBe(
      'This post has been deleted by its author.',
    );
    expect(deriveTextPreview({ content: '[DELETED]', kind: 'long' })).toBe('This post has been deleted by its author.');
  });

  it('returns the parsed article title for a long post', () => {
    const content = JSON.stringify({ title: 'My Article', body: 'Body text' });
    expect(deriveTextPreview({ content, kind: 'long' })).toBe('My Article');
  });

  it('falls back to raw content for a long post with unparseable content', () => {
    expect(deriveTextPreview({ content: 'plain text', kind: 'long' })).toBe('plain text');
  });

  it('returns the parsed collection name for a collection post', () => {
    const content = JSON.stringify({ name: 'My Collection' });
    expect(deriveTextPreview({ content, kind: 'collection' })).toBe('My Collection');
  });

  it('falls back to raw content for a collection post with unparseable content', () => {
    expect(deriveTextPreview({ content: 'plain text', kind: 'collection' })).toBe('plain text');
  });

  it('returns raw content for other kinds', () => {
    expect(deriveTextPreview({ content: 'hello', kind: 'short' })).toBe('hello');
    expect(deriveTextPreview({ content: 'hello', kind: 'image' })).toBe('hello');
    expect(deriveTextPreview({ content: 'https://x.test', kind: 'link' })).toBe('https://x.test');
  });
});
