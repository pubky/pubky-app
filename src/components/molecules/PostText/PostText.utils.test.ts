import { describe, it, expect } from 'vitest';
import type { Root, Paragraph, Text, Code, Link } from 'mdast';
import {
  remarkPlaintextCodeblock,
  remarkDisallowMarkdownLinks,
  remarkHashtags,
  remarkMentions,
  extractTextFromChildren,
  truncateAtWordBoundary,
} from './PostText.utils';

// Helper to create a simple paragraph node with text
const createParagraph = (text: string): Paragraph => ({
  type: 'paragraph',
  children: [{ type: 'text', value: text } as Text],
});

// Helper to create a root node with children
const createRoot = (children: (Paragraph | Code)[]): Root => ({
  type: 'root',
  children,
});

// Helper to extract link nodes from paragraph children
const getLinks = (paragraph: Paragraph): Link[] =>
  paragraph.children.filter((child): child is Link => child.type === 'link');

// Helper to extract text nodes from paragraph children
const getTextNodes = (paragraph: Paragraph): Text[] =>
  paragraph.children.filter((child): child is Text => child.type === 'text');

describe('remarkPlaintextCodeblock', () => {
  it('assigns plaintext to code blocks without a language', () => {
    const codeBlock: Code = { type: 'code', value: 'const x = 1;' };
    const tree = createRoot([codeBlock]);

    remarkPlaintextCodeblock()(tree);

    expect(codeBlock.lang).toBe('plaintext');
  });

  it('preserves existing language on code blocks', () => {
    const codeBlock: Code = { type: 'code', value: 'const x = 1;', lang: 'javascript' };
    const tree = createRoot([codeBlock]);

    remarkPlaintextCodeblock()(tree);

    expect(codeBlock.lang).toBe('javascript');
  });

  it('handles multiple code blocks', () => {
    const codeBlock1: Code = { type: 'code', value: 'code 1' };
    const codeBlock2: Code = { type: 'code', value: 'code 2', lang: 'python' };
    const codeBlock3: Code = { type: 'code', value: 'code 3' };
    const tree = createRoot([codeBlock1, codeBlock2, codeBlock3]);

    remarkPlaintextCodeblock()(tree);

    expect(codeBlock1.lang).toBe('plaintext');
    expect(codeBlock2.lang).toBe('python');
    expect(codeBlock3.lang).toBe('plaintext');
  });
});

describe('remarkDisallowMarkdownLinks', () => {
  // Helper to create a link node (simulating what the markdown parser creates)
  const createLink = (text: string, url: string, title?: string): Link => ({
    type: 'link',
    url,
    title: title ?? null,
    children: [{ type: 'text', value: text } as Text],
  });

  // Helper to create a paragraph with a link
  const createParagraphWithLink = (text: string, url: string, title?: string): Paragraph => ({
    type: 'paragraph',
    children: [createLink(text, url, title)],
  });

  describe('Preserves GFM autolinks', () => {
    it('preserves autolinks where text matches URL exactly', () => {
      const paragraph = createParagraphWithLink('https://example.com', 'https://example.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com');
    });

    it('preserves www autolinks where GFM adds http:// prefix', () => {
      const paragraph = createParagraphWithLink('www.example.com', 'http://www.example.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('http://www.example.com');
    });

    it('preserves email autolinks where GFM adds mailto: prefix', () => {
      const paragraph = createParagraphWithLink('user@example.com', 'mailto:user@example.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('mailto:user@example.com');
    });

    it('preserves http:// autolinks', () => {
      const paragraph = createParagraphWithLink('http://example.com', 'http://example.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
    });
  });

  describe('Converts markdown links to plaintext', () => {
    it('converts markdown link with different text and URL to plaintext', () => {
      const paragraph = createParagraphWithLink('click here', 'https://example.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      const textNodes = getTextNodes(paragraph);
      expect(links).toHaveLength(0);
      expect(textNodes).toHaveLength(1);
      expect(textNodes[0].value).toBe('[click here](https://example.com)');
    });

    it('converts deceptive link where text looks like a URL', () => {
      const paragraph = createParagraphWithLink('facebook.com', 'https://badsite.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      const textNodes = getTextNodes(paragraph);
      expect(links).toHaveLength(0);
      expect(textNodes[0].value).toBe('[facebook.com](https://badsite.com)');
    });

    it('converts markdown link with title to plaintext including title', () => {
      const paragraph = createParagraphWithLink('click here', 'https://example.com', 'My Title');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes[0].value).toBe('[click here](https://example.com "My Title")');
    });

    it('converts link where text is URL but different from href', () => {
      const paragraph = createParagraphWithLink('https://safe.com', 'https://evil.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      const textNodes = getTextNodes(paragraph);
      expect(links).toHaveLength(0);
      expect(textNodes[0].value).toBe('[https://safe.com](https://evil.com)');
    });

    it('converts www link with https URL (not matching http:// prefix)', () => {
      const paragraph = createParagraphWithLink('www.example.com', 'https://www.example.com');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const links = getLinks(paragraph);
      const textNodes = getTextNodes(paragraph);
      expect(links).toHaveLength(0);
      expect(textNodes[0].value).toBe('[www.example.com](https://www.example.com)');
    });
  });

  describe('Handles nested formatting in links', () => {
    it('extracts text from bold formatted link text', () => {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://evil.com',
            children: [
              {
                type: 'strong',
                children: [{ type: 'text', value: 'bold text' } as Text],
              },
            ],
          } as Link,
        ],
      };
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes[0].value).toBe('[bold text](https://evil.com)');
    });

    it('extracts text from italic formatted link text', () => {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://evil.com',
            children: [
              {
                type: 'emphasis',
                children: [{ type: 'text', value: 'italic text' } as Text],
              },
            ],
          } as Link,
        ],
      };
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes[0].value).toBe('[italic text](https://evil.com)');
    });

    it('extracts text from mixed formatted link text', () => {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://evil.com',
            children: [
              { type: 'text', value: 'normal ' } as Text,
              {
                type: 'strong',
                children: [{ type: 'text', value: 'bold' } as Text],
              },
              { type: 'text', value: ' and ' } as Text,
              {
                type: 'emphasis',
                children: [{ type: 'text', value: 'italic' } as Text],
              },
            ],
          } as Link,
        ],
      };
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes[0].value).toBe('[normal bold and italic](https://evil.com)');
    });
  });

  describe('Edge cases', () => {
    it('handles multiple links in one paragraph', () => {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Check ' } as Text,
          createLink('https://example.com', 'https://example.com'),
          { type: 'text', value: ' and ' } as Text,
          createLink('click here', 'https://other.com'),
        ],
      };
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      // First link should be preserved (autolink), second converted to text
      const links = getLinks(paragraph);
      const textNodes = getTextNodes(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com');
      expect(textNodes.some((t) => t.value === '[click here](https://other.com)')).toBe(true);
    });

    it('handles empty link text', () => {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://example.com',
            children: [],
          } as Link,
        ],
      };
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes[0].value).toBe('[](https://example.com)');
    });

    it('does not modify tree when no links exist', () => {
      const paragraph = createParagraph('Just some text without links');
      const tree = createRoot([paragraph]);

      remarkDisallowMarkdownLinks()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes).toHaveLength(1);
      expect(textNodes[0].value).toBe('Just some text without links');
    });

    it('handles links in multiple paragraphs', () => {
      const paragraph1 = createParagraphWithLink('click', 'https://example.com');
      const paragraph2 = createParagraphWithLink('https://auto.com', 'https://auto.com');
      const tree = createRoot([paragraph1, paragraph2]);

      remarkDisallowMarkdownLinks()(tree);

      // First paragraph link converted, second preserved
      expect(getLinks(paragraph1)).toHaveLength(0);
      expect(getLinks(paragraph2)).toHaveLength(1);
    });
  });
});

describe('remarkHashtags', () => {
  describe('Basic hashtag detection', () => {
    it('converts a single hashtag to a link', () => {
      const paragraph = createParagraph('#hello');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=hello');
      expect(links[0].data?.hProperties).toEqual({ 'data-type': 'hashtag' });
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('converts hashtag at start of text', () => {
      const paragraph = createParagraph('#start of the text');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=start');
    });

    it('converts hashtag preceded by whitespace', () => {
      const paragraph = createParagraph('Check out #trending today');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=trending');
    });

    it('converts multiple hashtags in one paragraph', () => {
      const paragraph = createParagraph('#hello world #foo and #bar');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(3);
      expect(links[0].url).toBe('/search?tags=hello');
      expect(links[1].url).toBe('/search?tags=foo');
      expect(links[2].url).toBe('/search?tags=bar');
    });

    it('preserves text before, between, and after hashtags', () => {
      const paragraph = createParagraph('Hello #world this is #cool right?');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes).toHaveLength(3);
      expect(textNodes[0].value).toBe('Hello ');
      expect(textNodes[1].value).toBe(' this is ');
      expect(textNodes[2].value).toBe(' right?');
    });
  });

  describe('Hashtag pattern validation', () => {
    it('allows hashtag to start with a letter', () => {
      const paragraph = createParagraph('#abc123 is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=abc123');
    });

    it('allows hashtags starting with a number', () => {
      const paragraph = createParagraph('#123abc is a valid hashtag');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=123abc');
    });

    it('allows underscores in hashtags', () => {
      const paragraph = createParagraph('#hello_world is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=hello_world');
    });

    it('allows multiple underscores separating words', () => {
      const paragraph = createParagraph('#one_two_three is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=one_two_three');
    });

    it('allows hyphens in hashtags', () => {
      const paragraph = createParagraph('#hello-world is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=hello-world');
    });

    it('allows multiple hyphens separating words', () => {
      const paragraph = createParagraph('#one-two-three is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=one-two-three');
    });

    it('allows mixed hyphens and underscores separating words', () => {
      const paragraph = createParagraph('#hello-world_test is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=hello-world_test');
    });

    it('does not match hashtags starting with underscore', () => {
      const paragraph = createParagraph('#_invalid is not a hashtag');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('stops at trailing underscore', () => {
      const paragraph = createParagraph('#hello_ world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('stops at double underscore', () => {
      const paragraph = createParagraph('#hello__world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('does not match hashtags starting with hyphen', () => {
      const paragraph = createParagraph('#-invalid is not a hashtag');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('stops at trailing hyphen', () => {
      const paragraph = createParagraph('#hello- world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('stops at double hyphen', () => {
      const paragraph = createParagraph('#hello--world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('stops at mixed consecutive separators (hyphen-underscore)', () => {
      const paragraph = createParagraph('#hello-_world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('stops at mixed consecutive separators (underscore-hyphen)', () => {
      const paragraph = createParagraph('#hello_-world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('allows numbers after the first letter', () => {
      const paragraph = createParagraph('#test123abc is valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=test123abc');
    });

    it('stops at punctuation', () => {
      const paragraph = createParagraph('#hello, world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });

    it('stops at special characters', () => {
      const paragraph = createParagraph('#hello!world');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe('#hello');
    });
  });

  describe('False positive prevention', () => {
    it('does not match hash not preceded by whitespace', () => {
      const paragraph = createParagraph('no#hashtag here');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('does not match hash in middle of word', () => {
      const paragraph = createParagraph('test#tag should not match');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('does not process non-text children (preserves existing links)', () => {
      const existingLink: Link = {
        type: 'link',
        url: 'https://example.com#section',
        children: [{ type: 'text', value: 'link with hash' } as Text],
      };
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Check out ' } as Text,
          existingLink,
          { type: 'text', value: ' for more' } as Text,
        ],
      };
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      // The existing link should be preserved unchanged
      expect(paragraph.children).toContain(existingLink);
      expect(existingLink.url).toBe('https://example.com#section');
    });

    it('does not match standalone hash symbol', () => {
      const paragraph = createParagraph('Use # for comments');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('matches hash followed by only numbers', () => {
      const paragraph = createParagraph('Issue #123 is fixed');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=123');
    });

    it('handles multiple hashes in sequence', () => {
      const paragraph = createParagraph('##notahashtag but #valid is');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      // ##notahashtag should not match (starts with ##)
      // #valid should match
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=valid');
    });
  });

  describe('Edge cases', () => {
    it('handles empty text', () => {
      const paragraph = createParagraph('');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      expect(paragraph.children).toHaveLength(1);
      expect((paragraph.children[0] as Text).value).toBe('');
    });

    it('handles text with no hashtags', () => {
      const paragraph = createParagraph('Just some regular text without hashtags');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
      expect((paragraph.children[0] as Text).value).toBe('Just some regular text without hashtags');
    });

    it('handles hashtag at end of text', () => {
      const paragraph = createParagraph('Check out #lastword');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=lastword');
    });

    it('handles consecutive hashtags', () => {
      const paragraph = createParagraph('#one #two #three');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(3);
    });

    it('handles hashtag with single character', () => {
      const paragraph = createParagraph('#a is minimal');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=a');
    });

    it('handles mixed valid and invalid hashtag patterns', () => {
      const paragraph = createParagraph('#valid #123numeric no#match #also_valid');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(3);
      expect(links[0].url).toBe('/search?tags=valid');
      expect(links[1].url).toBe('/search?tags=123numeric');
      expect(links[2].url).toBe('/search?tags=also_valid');
    });

    it('handles newlines as whitespace', () => {
      const paragraph = createParagraph('line one\n#hashtag on new line');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=hashtag');
    });

    it('handles tabs as whitespace', () => {
      const paragraph = createParagraph('text\t#hashtag after tab');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=hashtag');
    });

    it('encodes special characters in tag URL', () => {
      // While our regex only allows alphanumeric and underscore,
      // this test ensures the encoding is in place
      const paragraph = createParagraph('#CamelCase');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('/search?tags=CamelCase');
    });

    it('does not modify tree when no paragraphs exist', () => {
      const codeBlock: Code = { type: 'code', value: '#notahashtag' };
      const tree = createRoot([codeBlock]);

      remarkHashtags()(tree);

      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].type).toBe('code');
    });

    it('handles paragraph with only link children', () => {
      const existingLink: Link = {
        type: 'link',
        url: 'https://example.com',
        children: [{ type: 'text', value: 'example' } as Text],
      };
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [existingLink],
      };
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      // Should not modify anything
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toBe(existingLink);
    });
  });

  describe('Link node structure', () => {
    it('creates link with correct data-type attribute', () => {
      const paragraph = createParagraph('#test');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links[0].data).toEqual({
        hProperties: {
          'data-type': 'hashtag',
        },
      });
    });

    it('creates link with hashtag text including # symbol', () => {
      const paragraph = createParagraph('#myhashtag');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links[0].children).toHaveLength(1);
      expect((links[0].children[0] as Text).type).toBe('text');
      expect((links[0].children[0] as Text).value).toBe('#myhashtag');
    });

    it('creates URL with tag name without # symbol', () => {
      const paragraph = createParagraph('#example');
      const tree = createRoot([paragraph]);

      remarkHashtags()(tree);

      const links = getLinks(paragraph);
      expect(links[0].url).toBe('/search?tags=example');
      expect(links[0].url).not.toContain('#');
    });
  });
});

// Valid public key for testing (pk: + 52 lowercase alphanumeric chars = 55 total)
const VALID_PK = 'pk:6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
const VALID_PK_2 = 'pk:abcdefghijklmnopqrstuvwxyz01234567890abcdefghijklmno';
const VALID_PK_3 = 'pk:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz1';

// Valid public key with pubky prefix (pubky + 52 lowercase alphanumeric chars = 57 total)
const VALID_PUBKY = 'pubky6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
const VALID_PUBKY_2 = 'pubkyabcdefghijklmnopqrstuvwxyz01234567890abcdefghijklmno';

// Raw public keys without prefix (52 lowercase alphanumeric chars)
const RAW_PK = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
const RAW_PK_2 = 'abcdefghijklmnopqrstuvwxyz01234567890abcdefghijklmno';
const RAW_PK_3 = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz1';

describe('remarkMentions', () => {
  describe('Basic mention detection', () => {
    it('converts a single mention to a link', () => {
      const paragraph = createParagraph(VALID_PK);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
      expect(links[0].data?.hProperties).toEqual({ 'data-type': 'mention' });
      expect((links[0].children[0] as Text).value).toBe(VALID_PK);
    });

    it('converts mention at start of text', () => {
      const paragraph = createParagraph(`${VALID_PK} is a user`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });

    it('converts mention preceded by whitespace', () => {
      const paragraph = createParagraph(`Check out ${VALID_PK} today`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });

    it('converts multiple mentions in one paragraph', () => {
      const paragraph = createParagraph(`${VALID_PK} and ${VALID_PK_2} are friends with ${VALID_PK_3}`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(3);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
      expect(links[1].url).toBe(`/profile/${encodeURIComponent(RAW_PK_2)}`);
      expect(links[2].url).toBe(`/profile/${encodeURIComponent(RAW_PK_3)}`);
    });

    it('preserves text before, between, and after mentions', () => {
      const paragraph = createParagraph(`Hello ${VALID_PK} this is ${VALID_PK_2} right?`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const textNodes = getTextNodes(paragraph);
      expect(textNodes).toHaveLength(3);
      expect(textNodes[0].value).toBe('Hello ');
      expect(textNodes[1].value).toBe(' this is ');
      expect(textNodes[2].value).toBe(' right?');
    });
  });

  describe('Mention pattern validation', () => {
    it('requires pk: or pubky prefix', () => {
      const paragraph = createParagraph('6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('converts pubky prefix mentions to links', () => {
      const paragraph = createParagraph(VALID_PUBKY);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
      expect((links[0].children[0] as Text).value).toBe(VALID_PUBKY);
    });

    it('converts multiple pubky prefix mentions', () => {
      const paragraph = createParagraph(`${VALID_PUBKY} and ${VALID_PUBKY_2}`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
      expect(links[1].url).toBe(`/profile/${encodeURIComponent(RAW_PK_2)}`);
    });

    it('handles mixed pk: and pubky prefix mentions', () => {
      const paragraph = createParagraph(`${VALID_PK} and ${VALID_PUBKY_2}`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
      expect(links[1].url).toBe(`/profile/${encodeURIComponent(RAW_PK_2)}`);
    });

    it('does not match if too short after pk:', () => {
      // Too short (51 chars after pk:)
      const paragraph = createParagraph('pk:6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproaho');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('does not match if too long after pk:', () => {
      // Too long - 53 chars after pk: (the regex should only match exactly 52)
      const paragraph = createParagraph('pk:6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoyy');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      // Should match the first 55 chars as valid, leaving extra 'y' as text
      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe(VALID_PK);
    });

    it('requires lowercase letters only', () => {
      // Contains uppercase letter
      const paragraph = createParagraph('pk:6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoY');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('allows numbers in the key', () => {
      const paragraph = createParagraph('pk:0123456789012345678901234567890123456789012345678901');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
    });

    it('stops at punctuation after valid mention', () => {
      const paragraph = createParagraph(`${VALID_PK}, is mentioned`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe(VALID_PK);
    });

    it('stops at special characters after valid mention', () => {
      const paragraph = createParagraph(`${VALID_PK}!world`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect((links[0].children[0] as Text).value).toBe(VALID_PK);
    });
  });

  describe('False positive prevention', () => {
    it('does not match pk: not preceded by whitespace', () => {
      const paragraph = createParagraph(`no${VALID_PK} here`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('does not match pk: in middle of word', () => {
      const paragraph = createParagraph(`test${VALID_PK} should not match`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('does not process non-text children (preserves existing links)', () => {
      const existingLink: Link = {
        type: 'link',
        url: `https://example.com/${VALID_PK}`,
        children: [{ type: 'text', value: 'link with pk' } as Text],
      };
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Check out ' } as Text,
          existingLink,
          { type: 'text', value: ' for more' } as Text,
        ],
      };
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      // The existing link should be preserved unchanged
      expect(paragraph.children).toContain(existingLink);
      expect(existingLink.url).toBe(`https://example.com/${VALID_PK}`);
    });

    it('does not match standalone pk: without key', () => {
      const paragraph = createParagraph('Use pk: for mentions');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });

    it('does not match pk: with special characters in key', () => {
      const paragraph = createParagraph('pk:6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehpro_hoy');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('handles empty text', () => {
      const paragraph = createParagraph('');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      expect(paragraph.children).toHaveLength(1);
      expect((paragraph.children[0] as Text).value).toBe('');
    });

    it('handles text with no mentions', () => {
      const paragraph = createParagraph('Just some regular text without mentions');
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(0);
      expect((paragraph.children[0] as Text).value).toBe('Just some regular text without mentions');
    });

    it('handles mention at end of text', () => {
      const paragraph = createParagraph(`Check out ${VALID_PK}`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });

    it('handles consecutive mentions', () => {
      const paragraph = createParagraph(`${VALID_PK} ${VALID_PK_2} ${VALID_PK_3}`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(3);
    });

    it('handles newlines as whitespace', () => {
      const paragraph = createParagraph(`line one\n${VALID_PK} on new line`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });

    it('handles tabs as whitespace', () => {
      const paragraph = createParagraph(`text\t${VALID_PK} after tab`);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });

    it('encodes the public key in URL', () => {
      const paragraph = createParagraph(VALID_PK);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      // The URL should only contain the raw public key (no prefix)
      expect(links[0].url).toBe(`/profile/${RAW_PK}`);
      // The URL should NOT contain pk: or pubky prefix
      expect(links[0].url).not.toContain('pk:');
      expect(links[0].url).not.toContain('pubky');
    });

    it('does not modify tree when no paragraphs exist', () => {
      const codeBlock: Code = { type: 'code', value: VALID_PK };
      const tree = createRoot([codeBlock]);

      remarkMentions()(tree);

      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].type).toBe('code');
    });

    it('handles paragraph with only link children', () => {
      const existingLink: Link = {
        type: 'link',
        url: 'https://example.com',
        children: [{ type: 'text', value: 'example' } as Text],
      };
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [existingLink],
      };
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      // Should not modify anything
      expect(paragraph.children).toHaveLength(1);
      expect(paragraph.children[0]).toBe(existingLink);
    });
  });

  describe('Link node structure', () => {
    it('creates link with correct data-type attribute', () => {
      const paragraph = createParagraph(VALID_PK);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links[0].data).toEqual({
        hProperties: {
          'data-type': 'mention',
        },
      });
    });

    it('creates link with full public key as text', () => {
      const paragraph = createParagraph(VALID_PK);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links[0].children).toHaveLength(1);
      expect((links[0].children[0] as Text).type).toBe('text');
      expect((links[0].children[0] as Text).value).toBe(VALID_PK);
    });

    it('creates URL with public key only (without prefix)', () => {
      const paragraph = createParagraph(VALID_PK);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });

    it('creates URL with public key only for pubky prefix', () => {
      const paragraph = createParagraph(VALID_PUBKY);
      const tree = createRoot([paragraph]);

      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links[0].url).toBe(`/profile/${encodeURIComponent(RAW_PK)}`);
    });
  });

  describe('Interaction with hashtags', () => {
    it('mentions and hashtags do not interfere with each other', () => {
      const paragraph = createParagraph(`#hello ${VALID_PK} #world`);
      const tree = createRoot([paragraph]);

      // Apply mentions first
      remarkMentions()(tree);

      // Mentions should be detected, hashtags should remain as text
      const links = getLinks(paragraph);
      expect(links).toHaveLength(1);
      expect(links[0].data?.hProperties).toEqual({ 'data-type': 'mention' });
    });

    it('both plugins can be applied in sequence', () => {
      const paragraph = createParagraph(`#hello ${VALID_PK} #world`);
      const tree = createRoot([paragraph]);

      // Apply both plugins
      remarkHashtags()(tree);
      remarkMentions()(tree);

      const links = getLinks(paragraph);
      expect(links).toHaveLength(3);

      // Check that we have both hashtags and mentions
      const hashtags = links.filter((l) => l.data?.hProperties?.['data-type'] === 'hashtag');
      const mentions = links.filter((l) => l.data?.hProperties?.['data-type'] === 'mention');

      expect(hashtags).toHaveLength(2);
      expect(mentions).toHaveLength(1);
    });
  });
});

describe('extractTextFromChildren', () => {
  describe('String input', () => {
    it('returns the string when children is a string', () => {
      expect(extractTextFromChildren('hello world')).toBe('hello world');
    });

    it('returns empty string when children is an empty string', () => {
      expect(extractTextFromChildren('')).toBe('');
    });

    it('handles strings with special characters', () => {
      expect(extractTextFromChildren('#hashtag @mention <html>')).toBe('#hashtag @mention <html>');
    });

    it('handles multiline strings', () => {
      expect(extractTextFromChildren('line1\nline2\nline3')).toBe('line1\nline2\nline3');
    });
  });

  describe('Array input', () => {
    it('returns first element when array starts with a string', () => {
      expect(extractTextFromChildren(['first', 'second', 'third'])).toBe('first');
    });

    it('returns empty string for first element if it is empty', () => {
      expect(extractTextFromChildren(['', 'second'])).toBe('');
    });

    it('returns empty string when array is empty', () => {
      expect(extractTextFromChildren([])).toBe('');
    });

    it('returns empty string when first element is not a string', () => {
      expect(extractTextFromChildren([123, 'second'])).toBe('');
    });

    it('returns empty string when first element is an object', () => {
      expect(extractTextFromChildren([{ text: 'hello' }, 'second'] as unknown as React.ReactNode)).toBe('');
    });

    it('returns empty string when first element is null', () => {
      expect(extractTextFromChildren([null, 'second'])).toBe('');
    });

    it('returns empty string when first element is undefined', () => {
      expect(extractTextFromChildren([undefined, 'second'])).toBe('');
    });
  });

  describe('Other input types', () => {
    it('returns empty string for null', () => {
      expect(extractTextFromChildren(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(extractTextFromChildren(undefined)).toBe('');
    });

    it('returns empty string for number', () => {
      expect(extractTextFromChildren(42 as unknown as React.ReactNode)).toBe('');
    });

    it('returns empty string for boolean', () => {
      expect(extractTextFromChildren(true as unknown as React.ReactNode)).toBe('');
    });

    it('returns empty string for object', () => {
      expect(extractTextFromChildren({ type: 'element' } as unknown as React.ReactNode)).toBe('');
    });
  });
});

describe('truncateAtWordBoundary', () => {
  it('returns original text if under limit', () => {
    const text = 'Short text';
    expect(truncateAtWordBoundary(text, 100)).toBe('Short text');
  });

  it('returns original text if exactly at limit', () => {
    const text = 'Hello';
    expect(truncateAtWordBoundary(text, 5)).toBe('Hello');
  });

  it('truncates at word boundary when space is within 80% of limit', () => {
    const text = 'Hello world this is a test';
    // Limit 20, slice(0,20) = "Hello world this is ", lastSpace = 16, 80% = 16, 16 > 16 = false
    // Actually: "Hello world this is " has space at 11 and 17, lastSpace = 17
    // 17 > 16 = true, so truncates at word boundary
    const result = truncateAtWordBoundary(text, 20);
    expect(result).toBe('Hello world this is...\u00A0');
  });

  it('hard cuts when no suitable word boundary within 80% of limit', () => {
    const text = 'Supercalifragilisticexpialidocious is a long word';
    // Limit 20, 80% = 16, no space within first 20 chars
    const result = truncateAtWordBoundary(text, 20);
    expect(result).toBe('Supercalifragilistic...\u00A0');
  });

  it('truncates at last word boundary before limit', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    // Limit 25, slice(0,25) = "The quick brown fox jumps", lastSpace = 19
    // 80% of 25 = 20, 19 < 20, so hard cuts
    const result = truncateAtWordBoundary(text, 25);
    expect(result).toBe('The quick brown fox jumps...\u00A0');
  });

  it('avoids cutting mid-word when space is within threshold', () => {
    const text = 'This is collaboration between teams';
    // Limit 25, slice(0,25) = "This is collaboration bet", lastSpace = 21
    // 80% of 25 = 20, 21 > 20 = true, so truncates at "collaboration"
    const result = truncateAtWordBoundary(text, 25);
    expect(result).toBe('This is collaboration...\u00A0');
  });

  it('preserves words when possible', () => {
    const text = 'Short words here now test';
    // Limit 22, slice(0,22) = "Short words here now t", lastSpace = 20
    // 80% of 22 = 17, 20 > 17 = true, so truncates at word boundary
    const result = truncateAtWordBoundary(text, 22);
    expect(result).toBe('Short words here now...\u00A0');
  });

  it('handles text with no spaces by hard cutting', () => {
    const text = 'NoSpacesInThisLongText';
    const result = truncateAtWordBoundary(text, 10);
    expect(result).toBe('NoSpacesIn...\u00A0');
  });

  it('handles text with space at very end of limit', () => {
    const text = 'Word Word2 Word3';
    // Limit 10, space at index 4 and 10
    const result = truncateAtWordBoundary(text, 10);
    expect(result).toBe('Word Word2...\u00A0');
  });

  it('appends ellipsis with non-breaking space', () => {
    const text = 'Hello world test';
    const result = truncateAtWordBoundary(text, 12);
    expect(result.endsWith('...\u00A0')).toBe(true);
  });
});
