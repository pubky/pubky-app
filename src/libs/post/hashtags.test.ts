import { describe, expect, it } from 'vitest';
import { extractHashtagLabelsFromMarkdown, mergeTagLabels } from './hashtags';

describe('extractHashtagLabelsFromMarkdown', () => {
  describe('paragraph text', () => {
    it('returns hashtags in first-appearance order, canonicalized', () => {
      expect(extractHashtagLabelsFromMarkdown('Hello #World, and #pubky too')).toEqual(['world', 'pubky']);
    });

    it('finds a hashtag at the very start of the content', () => {
      expect(extractHashtagLabelsFromMarkdown('#start of the post')).toEqual(['start']);
    });

    it('deduplicates labels that differ only in case', () => {
      expect(extractHashtagLabelsFromMarkdown('#Tag and #tag and #TAG')).toEqual(['tag']);
    });

    it('finds hashtags in list items and blockquotes', () => {
      const content = '- item with #one\n- item with #two\n\n> quote with #three';

      expect(extractHashtagLabelsFromMarkdown(content)).toEqual(['one', 'two', 'three']);
    });

    it('finds a hashtag in the same paragraph as emphasis', () => {
      expect(extractHashtagLabelsFromMarkdown('**bold** text with #tag')).toEqual(['tag']);
    });

    it('keeps trailing punctuation that the rendered link keeps', () => {
      // `remarkHashtags` links the whole match (only pubky-app-specs tagInvalidChars stop the
      // body), so `/search?tags=tag!` is what a reader can click. The created tag matches it.
      expect(extractHashtagLabelsFromMarkdown('Hello #tag!')).toEqual(['tag!']);
    });

    it('stops the label at a banned character', () => {
      expect(extractHashtagLabelsFromMarkdown('Hello #tag, and #other')).toEqual(['tag', 'other']);
    });

    it('returns nothing for an empty or whitespace-only body', () => {
      expect(extractHashtagLabelsFromMarkdown('')).toEqual([]);
      expect(extractHashtagLabelsFromMarkdown('   \n  ')).toEqual([]);
    });
  });

  describe('non-hashtag markdown', () => {
    it('ignores headings, which `remarkHashtags` does not link', () => {
      expect(extractHashtagLabelsFromMarkdown('# Heading with #inside\n\nA paragraph with #outside')).toEqual([
        'outside',
      ]);
    });

    it('ignores fenced code', () => {
      expect(extractHashtagLabelsFromMarkdown('```\n#notatag\n```\n\nReal #tag')).toEqual(['tag']);
    });

    it('ignores inline code', () => {
      expect(extractHashtagLabelsFromMarkdown('Use `#notatag` here, and #tag')).toEqual(['tag']);
    });

    it('ignores markdown link labels', () => {
      expect(extractHashtagLabelsFromMarkdown('[#notatag](https://example.com)')).toEqual([]);
    });

    it('ignores autolinked URLs and their fragments', () => {
      expect(extractHashtagLabelsFromMarkdown('See https://example.com/page#section for #tag')).toEqual(['tag']);
    });

    it('ignores a bare hash and a hash followed by a space', () => {
      expect(extractHashtagLabelsFromMarkdown('a # b and a #  and #')).toEqual([]);
    });

    it('ignores a label that starts with a non-alphanumeric character', () => {
      expect(extractHashtagLabelsFromMarkdown('#_tag #-tag')).toEqual([]);
    });
  });

  describe('renderer preprocessing', () => {
    it.each([false, true])('extracts table hashtags (article: %s)', (isArticle) => {
      expect(extractHashtagLabelsFromMarkdown('| Topic |\n| --- |\n| #pubky |', isArticle)).toEqual(['pubky']);
    });

    it('extracts text exposed by a short-post Markdown link rewrite', () => {
      expect(extractHashtagLabelsFromMarkdown('[Discuss #pubky here](https://example.com)')).toEqual(['pubky']);
    });

    it('leaves genuine article links excluded', () => {
      expect(extractHashtagLabelsFromMarkdown('[Discuss #pubky here](https://example.com)', true)).toEqual([]);
    });

    it.each([false, true])('matches table rewrites that expose formatted cell text (article: %s)', (isArticle) => {
      expect(extractHashtagLabelsFromMarkdown('| Topic |\n| --- |\n| **Talk #pubky here** |', isArticle)).toEqual([
        'pubky',
      ]);
    });
  });

  describe('label validation', () => {
    it('ignores labels longer than the tag limit', () => {
      const tooLong = `#${'a'.repeat(21)}`;

      expect(extractHashtagLabelsFromMarkdown(tooLong)).toEqual([]);
    });

    it('keeps labels at exactly the tag limit', () => {
      const atLimit = `#${'a'.repeat(20)}`;

      expect(extractHashtagLabelsFromMarkdown(atLimit)).toEqual(['a'.repeat(20)]);
    });

    it('keeps emoji inside a label, like the rendered link does', () => {
      expect(extractHashtagLabelsFromMarkdown('party #party🎉')).toEqual(['party🎉']);
    });
  });
});

describe('mergeTagLabels', () => {
  it('returns explicit labels unchanged when nothing was extracted', () => {
    expect(mergeTagLabels(['bitcoin'], [], 5)).toEqual(['bitcoin']);
  });

  it('appends extracted labels after the explicit ones', () => {
    expect(mergeTagLabels(['bitcoin'], ['nostr', 'pubky'], 5)).toEqual(['bitcoin', 'nostr', 'pubky']);
  });

  it('drops an extracted label the composer already holds, ignoring case', () => {
    expect(mergeTagLabels(['Bitcoin'], ['bitcoin', 'pubky'], 5)).toEqual(['Bitcoin', 'pubky']);
  });

  it('drops duplicate explicit labels', () => {
    expect(mergeTagLabels(['bitcoin', 'BITCOIN'], [], 5)).toEqual(['bitcoin']);
  });

  it('stops adding extracted labels at the limit', () => {
    expect(mergeTagLabels(['one'], ['two', 'three', 'four'], 3)).toEqual(['one', 'two', 'three']);
  });

  it('never drops an explicit label, even past the limit', () => {
    expect(mergeTagLabels(['one', 'two', 'three', 'four'], ['five'], 3)).toEqual(['one', 'two', 'three', 'four']);
  });

  it('adds nothing when the explicit labels already fill the limit', () => {
    expect(mergeTagLabels(['one', 'two'], ['three'], 2)).toEqual(['one', 'two']);
  });
});
