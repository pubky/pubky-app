import { describe, expect, it } from 'vitest';
import { markdownToText } from './markdownToText';

describe('markdownToText', () => {
  describe('empty / nullish input', () => {
    it('returns empty string for null / undefined / empty', () => {
      expect(markdownToText(null)).toBe('');
      expect(markdownToText(undefined)).toBe('');
      expect(markdownToText('')).toBe('');
      expect(markdownToText('   \n  \n')).toBe('');
    });

    it('leaves plain prose untouched (whitespace collapsed)', () => {
      expect(markdownToText('Just some plain text.')).toBe('Just some plain text.');
      expect(markdownToText('two   spaces\nand a newline')).toBe('two spaces and a newline');
    });
  });

  describe('headings', () => {
    it('strips ATX heading markers', () => {
      expect(markdownToText('# Heading')).toBe('Heading');
      expect(markdownToText('### Deep heading')).toBe('Deep heading');
    });

    it('strips trailing closing hashes', () => {
      expect(markdownToText('## Balanced ##')).toBe('Balanced');
    });

    it('drops setext underlines but keeps the heading text', () => {
      expect(markdownToText('Title\n=====\n\nBody')).toBe('Title Body');
      expect(markdownToText('Title\n-----\n\nBody')).toBe('Title Body');
    });
  });

  describe('emphasis', () => {
    it('unwraps bold and italic', () => {
      expect(markdownToText('**bold** and *italic*')).toBe('bold and italic');
      expect(markdownToText('__bold__ and _italic_')).toBe('bold and italic');
    });

    it('unwraps bold+italic and strikethrough', () => {
      expect(markdownToText('***both*** ~~gone~~')).toBe('both gone');
    });

    it('preserves intraword underscores (snake_case is not emphasis)', () => {
      expect(markdownToText('use snake_case_here please')).toBe('use snake_case_here please');
      expect(markdownToText('a __b__ c snake_case')).toBe('a b c snake_case');
    });

    it('unwraps nested emphasis', () => {
      expect(markdownToText('**bold _and italic_**')).toBe('bold and italic');
    });
  });

  describe('code', () => {
    it('keeps inline code text', () => {
      expect(markdownToText('run `npm test` now')).toBe('run npm test now');
    });

    it('drops fenced code blocks', () => {
      expect(markdownToText('Intro\n```js\nconst x = 1;\n```\nOutro')).toBe('Intro Outro');
      expect(markdownToText('Intro\n~~~\nplain\n~~~\nOutro')).toBe('Intro Outro');
    });
  });

  describe('links and images', () => {
    it('keeps link text, drops the url', () => {
      expect(markdownToText('See [the docs](https://example.com/x)')).toBe('See the docs');
    });

    it('keeps reference-link text', () => {
      expect(markdownToText('See [the docs][1] today')).toBe('See the docs today');
    });

    it('drops reference definitions and footnotes', () => {
      expect(markdownToText('Body[^1] here\n\n[^1]: a footnote\n[1]: https://example.com')).toBe('Body here');
    });

    it('drops images entirely', () => {
      expect(markdownToText('before ![alt text](pic.png) after')).toBe('before after');
    });

    it('keeps autolink urls', () => {
      expect(markdownToText('Visit <https://example.com> now')).toBe('Visit https://example.com now');
    });
  });

  describe('html', () => {
    it('strips tags but keeps their text', () => {
      expect(markdownToText('<strong>Hi</strong> <em>there</em>')).toBe('Hi there');
    });

    it('drops html comments', () => {
      expect(markdownToText('a <!-- hidden --> b')).toBe('a b');
    });
  });

  describe('blockquotes and lists', () => {
    it('strips blockquote markers (including nested)', () => {
      expect(markdownToText('> quoted')).toBe('quoted');
      expect(markdownToText('>> deeply quoted')).toBe('deeply quoted');
    });

    it('strips unordered, ordered, and task-list markers', () => {
      expect(markdownToText('- one\n- two\n+ three\n* four')).toBe('one two three four');
      expect(markdownToText('1. first\n2) second')).toBe('first second');
      expect(markdownToText('- [ ] todo\n- [x] done')).toBe('todo done');
    });
  });

  describe('thematic breaks and tables', () => {
    it('drops horizontal rules', () => {
      expect(markdownToText('Above\n\n---\n\nBelow')).toBe('Above Below');
      expect(markdownToText('Above\n\n***\n\nBelow')).toBe('Above Below');
    });

    it('flattens a table to its cell text (delimiter row dropped)', () => {
      expect(markdownToText('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe('A B 1 2');
    });
  });

  describe('escapes and robustness', () => {
    it('unescapes backslash-escaped punctuation', () => {
      expect(markdownToText('literal \\*asterisks\\* and \\#hash')).toBe('literal *asterisks* and #hash');
    });

    it('never throws on malformed / adversarial input', () => {
      const inputs = ['**unterminated', '[bad](', '```\nno close', '~~~', '###', '> > >', '|||', '*'.repeat(500)];
      for (const input of inputs) {
        expect(() => markdownToText(input)).not.toThrow();
      }
    });

    it('handles a realistic article intro', () => {
      const md = [
        '# Do your own research',
        '',
        'I have said it **before**: If you don’t _believe_ me or don’t get it,',
        'read [the whitepaper](https://bitcoin.org/bitcoin.pdf).',
      ].join('\n');
      expect(markdownToText(md)).toBe(
        'Do your own research I have said it before: If you don’t believe me or don’t get it, read the whitepaper.',
      );
    });
  });
});
