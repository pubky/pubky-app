import type { Root, Paragraph, Text, Link, PhrasingContent, Parent, RootContent } from 'mdast';
import { ReactNode } from 'react';
import { visit } from 'unist-util-visit';

// We assign full code blocks without a language specified as plaintext (ex. ```...```)
export const remarkPlaintextCodeblock = () => (tree: Root) => {
  visit(tree, 'code', (node) => {
    node.lang = node.lang ?? 'plaintext';
  });
};

// Recursively extract text from a node and all its descendants.
// Handles nested formatting like [**bold** and _italic_](url) -> "bold and italic"
const extractText = (node: RootContent | PhrasingContent): string => {
  if (node.type === 'text') return (node as Text).value;
  if ('children' in node) {
    return (node.children as (RootContent | PhrasingContent)[]).map(extractText).join('');
  }
  return '';
};

// Disallow markdown link syntax [text](url) to prevent deceptive links.
// Example attack: [facebook.com](https://badsite.com) looks legitimate but links elsewhere.
// This plugin converts markdown-style links back to plaintext, showing the raw syntax.
// Must run AFTER remarkGfm since GFM is a syntax extension that runs at parse time.
// Autolinks (where text matches URL) are preserved since they're not deceptive.
export const remarkDisallowMarkdownLinks = () => (tree: Root) => {
  visit(tree, 'link', (node: Link, index: number | undefined, parent: Parent | undefined) => {
    if (parent === undefined || index === undefined) return;

    // Recursively extract text content from link children (handles nested formatting)
    const textContent = node.children.map(extractText).join('');

    // Preserve GFM autolinks (not deceptive):
    // - Exact match (e.g. https://example.com as both text and URL)
    // - www autolinks where GFM adds http:// prefix (e.g. www.example.com -> http://www.example.com)
    // - Email autolinks where GFM adds mailto: prefix (e.g. user@example.com -> mailto:user@example.com)
    const isAutolink =
      textContent === node.url || node.url === `http://${textContent}` || node.url === `mailto:${textContent}`;

    if (isAutolink) return;

    // Markdown-style link detected - convert back to plaintext
    // Include title if present: [text](url "title")
    const titlePart = node.title ? ` "${node.title}"` : '';
    const plaintext: Text = {
      type: 'text',
      value: `[${textContent}](${node.url}${titlePart})`,
    };

    // Replace the link node with plaintext
    (parent.children as PhrasingContent[]).splice(index, 1, plaintext);
  });
};

// Configuration for pattern-matching remark plugins
interface PatternPluginConfig {
  // Regex to match - must have capture groups: (leadingWhitespace)(fullMatch)
  regex: RegExp;
  // Function to generate the URL from the matched text
  getUrl: (match: string) => string;
  // The data-type attribute value for the link
  dataType: string;
}

// Factory function that creates a remark plugin for pattern matching and link conversion
const createPatternPlugin = (config: PatternPluginConfig) => {
  const { regex, getUrl, dataType } = config;

  return () => (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph) => {
      const newChildren: PhrasingContent[] = [];
      let hasChanges = false;

      for (const child of node.children) {
        // Only process direct text children to avoid false positives in URLs, code, etc.
        if (child.type !== 'text') {
          newChildren.push(child);
          continue;
        }

        const text = (child as Text).value;
        const segments: PhrasingContent[] = [];
        let lastIndex = 0;

        for (const match of text.matchAll(regex)) {
          hasChanges = true;
          const [fullMatch, leadingWhitespace, matchedText] = match;
          const matchStart = match.index;

          // Add text before the match (including any leading whitespace from the match)
          const textBefore = text.slice(lastIndex, matchStart) + leadingWhitespace;
          if (textBefore) {
            segments.push({
              type: 'text',
              value: textBefore,
            } as Text);
          }

          // Create a link node with the appropriate data-type for differentiation
          segments.push({
            type: 'link',
            url: getUrl(matchedText),
            data: {
              hProperties: {
                'data-type': dataType,
              },
            },
            children: [{ type: 'text', value: matchedText } as Text],
          } as Link);

          lastIndex = matchStart + fullMatch.length;
        }

        // Add any remaining text after the last match
        if (lastIndex < text.length) {
          segments.push({
            type: 'text',
            value: text.slice(lastIndex),
          } as Text);
        }

        // If we found matches, use the segments; otherwise keep original child
        if (segments.length > 0) {
          newChildren.push(...segments);
        } else {
          newChildren.push(child);
        }
      }

      // Only update children if we made changes
      if (hasChanges) {
        node.children = newChildren;
      }
    });
  };
};

// Parse hashtags in paragraph text nodes and convert them to links with data-type="hashtag"
// Hashtag pattern: # followed by a letter or number, then letters/numbers, with underscores or hyphens allowed only between alphanumerics
// Must be at start of text or preceded by whitespace (standalone)
export const remarkHashtags = createPatternPlugin({
  regex: /(^|\s)(#[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*)/g,
  getUrl: (hashtag: string) => {
    // Extract tag name without the # symbol for the URL
    const tagName = hashtag.slice(1);
    return `/search?tags=${encodeURIComponent(tagName)}`;
  },
  dataType: 'hashtag',
});

// Parse mentions in paragraph text nodes and convert them to links with data-type="mention"
// Mention pattern: pk: or pubky followed by exactly 52 lowercase alphanumeric characters
// Must be at start of text or preceded by whitespace (standalone)
export const remarkMentions = createPatternPlugin({
  regex: /(^|\s)((?:pk:|pubky)[a-z0-9]{52})/g,
  getUrl: (mention: string) => {
    // Extract the public key without the prefix (pk: or pubky)
    const publicKey = mention.startsWith('pk:') ? mention.slice(3) : mention.slice(5);
    return `/profile/${encodeURIComponent(publicKey)}`;
  },
  dataType: 'mention',
});

// Extract text safely - children from remark is typically a text node
export const extractTextFromChildren = (children: ReactNode) =>
  typeof children === 'string'
    ? children
    : Array.isArray(children) && typeof children[0] === 'string'
      ? children[0]
      : '';

// Truncate text at word boundaries to avoid cutting mid-word, mid-markdown, or mid-URL.
// Falls back to hard cut if no suitable word boundary is found within 80% of the limit.
export const truncateAtWordBoundary = (text: string, limit: number): string => {
  if (text.length <= limit) return text;

  const truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(' ');

  // Only use word boundary if it's within 80% of the limit to avoid too-short truncation
  const minBoundary = Math.floor(limit * 0.8);

  return (lastSpace > minBoundary ? truncated.slice(0, lastSpace) : truncated) + '...\u00A0';
};
