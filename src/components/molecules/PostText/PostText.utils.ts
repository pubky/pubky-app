import { ReactNode } from 'react';
import type {
  Blockquote,
  Heading,
  Link,
  List,
  ListItem,
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  Text,
} from 'mdast';
import { visit } from 'unist-util-visit';
import { Identity } from '@/libs/identity/identity';
import { isValidTagLabel } from '@/libs/utils/utils';
import { HASHTAG_IN_TEXT_REGEX } from '@/libs/utils/utils.constants';
import { POST_TEXT_PREVIEW_MAX_LINES, TRUNCATION_LIMIT } from './PostText.constants';

const TRUNCATION_ELLIPSIS = '...\u00A0';

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
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('alt' in node && typeof node.alt === 'string') return node.alt;
  if ('children' in node) {
    return (node.children as (RootContent | PhrasingContent)[]).map(extractText).join('');
  }
  return '';
};

const getTableCellPlaintext = (cell: TableCell): string => {
  return cell.children.map(extractText).join('').replace(/\s+/g, ' ').trim();
};

const getMarkdownTableDividerCell = (alignment: string | null | undefined): string => {
  if (alignment === 'left') return ':---';
  if (alignment === 'center') return ':---:';
  if (alignment === 'right') return '---:';

  return '---';
};

const formatMarkdownTableRow = (cells: string[], columnCount: number): string => {
  const paddedCells = Array.from({ length: columnCount }, (_, index) => cells[index] ?? '');
  return `| ${paddedCells.join(' | ')} |`;
};

const tableToPlaintext = (table: Table): string => {
  const rows = table.children.map((row) => row.children.map(getTableCellPlaintext));
  const columnCount = Math.max(table.align?.length ?? 0, ...rows.map((row) => row.length));

  if (columnCount === 0) return '';

  const [header = [], ...bodyRows] = rows;
  const divider = Array.from({ length: columnCount }, (_, index) => getMarkdownTableDividerCell(table.align?.[index]));

  return [
    formatMarkdownTableRow(header, columnCount),
    formatMarkdownTableRow(divider, columnCount),
    ...bodyRows.map((row) => formatMarkdownTableRow(row, columnCount)),
  ].join('\n');
};

// Tables are not supported by PostText. GFM still parses pipe-table syntax,
// so convert table nodes back to literal markdown before React unwraps cells.
// Note: Never was supported by PostText, but due the improvement of blank lines detection,
// it's a specific case to not even parse it.
export const remarkPlaintextTables = () => (tree: Root) => {
  visit(tree, 'table', (node: Table, index: number | undefined, parent: Parent | undefined) => {
    if (parent === undefined || index === undefined) return;

    const plaintext = tableToPlaintext(node);
    const replacement: Paragraph = {
      type: 'paragraph',
      children: [{ type: 'text', value: plaintext } as Text],
    };

    (parent.children as RootContent[]).splice(index, 1, replacement);
  });
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
  // When false, the matched span stays plain text (mentions omit this; hashtags use it)
  shouldConvert?: (matchedText: string) => boolean;
}

// Factory function that creates a remark plugin for pattern matching and link conversion
const createPatternPlugin = (config: PatternPluginConfig) => {
  const { regex, getUrl, dataType, shouldConvert } = config;

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
          const matchStart = match.index ?? 0;

          if (shouldConvert && !shouldConvert(matchedText)) {
            const plainSpan = text.slice(lastIndex, matchStart + fullMatch.length);
            if (plainSpan) {
              segments.push({
                type: 'text',
                value: plainSpan,
              } as Text);
            }
            lastIndex = matchStart + fullMatch.length;
            continue;
          }

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
// Pattern follows pubky-app-specs tagInvalidChars; isValidTagLabel gates link conversion (length, etc.)
// Must be at start of text or preceded by whitespace (standalone)
export const remarkHashtags = createPatternPlugin({
  regex: HASHTAG_IN_TEXT_REGEX,
  getUrl: (hashtag: string) => {
    // Extract tag name without the # symbol for the URL
    const tagName = hashtag.slice(1);
    return `/search?tags=${encodeURIComponent(tagName)}`;
  },
  dataType: 'hashtag',
  shouldConvert: (hashtag) => isValidTagLabel(hashtag.slice(1).trim().toLowerCase()),
});

// Parse mentions in paragraph text nodes and convert them to links with data-type="mention"
// Mention pattern: pk: or pubky followed by exactly 52 lowercase alphanumeric characters
// Must be at start of text or preceded by whitespace (standalone)
export const remarkMentions = createPatternPlugin({
  regex: new RegExp(`(^|\\s)(${Identity.PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE})`, 'g'),
  getUrl: (mention: string) => {
    // Extract the public key without the prefix (pk: or pubky)
    const publicKey = mention.startsWith('pk:') ? mention.slice(3) : mention.slice(5);
    return `/profile/${encodeURIComponent(publicKey)}`;
  },
  dataType: 'mention',
});

const createInlineShowMoreButton = (): Text =>
  ({
    type: 'text',
    value: 'more',
    data: {
      hName: 'button',
      hProperties: {
        'aria-label': 'Show full post content',
        'data-type': 'show-more',
        type: 'button',
      },
    },
  }) as Text;

const createEllipsisParagraph = (): Paragraph => ({
  type: 'paragraph',
  children: [{ type: 'text', value: TRUNCATION_ELLIPSIS } as Text],
});

const createInlineShowMoreParagraph = (): Paragraph => {
  const paragraph = createEllipsisParagraph();
  paragraph.children.push(createInlineShowMoreButton());
  return paragraph;
};

// Blocks that cannot host the inline button get the ellipsis paragraph appended after them instead.
// Their own trailing ellipsis is removed first so the preview does not render two of them.
const stripTrailingEllipsis = (node: RootContent | undefined): void => {
  if (!node) return;

  if ('value' in node && typeof node.value === 'string') {
    if (node.value.endsWith(TRUNCATION_ELLIPSIS)) {
      node.value = node.value.slice(0, -TRUNCATION_ELLIPSIS.length);
    }

    return;
  }

  if ('children' in node) stripTrailingEllipsis(node.children.at(-1));
};

// truncatePostPreviewText appends the ellipsis to the very end of the preview text, so the cut is
// always in the last top-level block. Attaching there instead of searching the tree for the
// ellipsis keeps a user-authored ellipsis from stealing the button or losing its own characters.
export const remarkInlineShowMore = () => (tree: Root) => {
  const lastBlock = tree.children.at(-1);

  if (lastBlock?.type === 'paragraph' || lastBlock?.type === 'heading') {
    lastBlock.children.push(createInlineShowMoreButton());
    return;
  }

  stripTrailingEllipsis(lastBlock);
  tree.children.push(createInlineShowMoreParagraph());
};

// Extract text safely - children from remark is typically a text node
export const extractTextFromChildren = (children: ReactNode) =>
  typeof children === 'string'
    ? children
    : Array.isArray(children) && typeof children[0] === 'string'
      ? children[0]
      : '';

interface PreviewTruncation {
  limit: number;
  wordBoundary: boolean;
}

const getPreviewTruncation = (text: string, maxLines = POST_TEXT_PREVIEW_MAX_LINES): PreviewTruncation | null => {
  const meaningfulText = text.trimEnd();
  const sourceLines = meaningfulText.split(/\r\n|\n/);
  const lineLimitedText = sourceLines.length > maxLines ? sourceLines.slice(0, maxLines).join('\n') : meaningfulText;

  if (lineLimitedText.length > TRUNCATION_LIMIT) {
    return {
      limit: TRUNCATION_LIMIT,
      wordBoundary: true,
    };
  }

  if (lineLimitedText.length < meaningfulText.length) {
    return {
      limit: lineLimitedText.length,
      wordBoundary: false,
    };
  }

  return null;
};

const getPreviewLineCount = (text: string): number => {
  const meaningfulText = text.trimEnd();
  if (meaningfulText.length === 0) return 1;

  return meaningfulText.split(/\r\n|\n/).length;
};

const truncateAtLineLimit = (text: string, maxLines: number): string => {
  if (maxLines <= 0) return TRUNCATION_ELLIPSIS;

  return `${text
    .trimEnd()
    .split(/\r\n|\n/)
    .slice(0, maxLines)
    .join('\n')}${TRUNCATION_ELLIPSIS}`;
};

const isMarkdownFenceDelimiter = (line: string): boolean => {
  return /^\s*(?:`{3,}|~{3,})/.test(line.trim());
};

const getLineLimitedPostPreviewText = (text: string, maxLines = POST_TEXT_PREVIEW_MAX_LINES): string => {
  const sourceLines = text.split(/\r\n|\n/);
  let renderedLineCount = 0;
  let sourceLineLimitIndex = -1;
  let inCodeFence = false;

  for (const [index, line] of sourceLines.entries()) {
    if (isMarkdownFenceDelimiter(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (!inCodeFence && line.trim().length === 0) continue;

    renderedLineCount += 1;

    if (renderedLineCount === maxLines) {
      sourceLineLimitIndex = index;
      continue;
    }

    if (renderedLineCount > maxLines) {
      return sourceLines.slice(0, sourceLineLimitIndex + 1).join('\n');
    }
  }

  return text;
};

export const truncatePostPreviewText = (text: string): string | null => {
  const meaningfulText = text.trimEnd();
  const lineLimitedText = getLineLimitedPostPreviewText(meaningfulText);

  if (lineLimitedText.length > TRUNCATION_LIMIT) {
    return truncateAtWordBoundary(lineLimitedText, TRUNCATION_LIMIT);
  }

  return lineLimitedText.length < meaningfulText.length ? `${lineLimitedText}${TRUNCATION_ELLIPSIS}` : null;
};

const appendEllipsisToParagraph = (paragraph: Paragraph): void => {
  const lastChild = paragraph.children[paragraph.children.length - 1];

  if (lastChild?.type === 'text') {
    lastChild.value = `${lastChild.value}${TRUNCATION_ELLIPSIS}`;
    return;
  }

  paragraph.children.push({ type: 'text', value: TRUNCATION_ELLIPSIS } as Text);
};

const appendEllipsisToHeading = (heading: Heading): void => {
  const lastChild = heading.children[heading.children.length - 1];

  if (lastChild?.type === 'text') {
    lastChild.value = `${lastChild.value}${TRUNCATION_ELLIPSIS}`;
    return;
  }

  heading.children.push({ type: 'text', value: TRUNCATION_ELLIPSIS } as Text);
};

const appendEllipsisToListItem = (listItem: ListItem): void => {
  const lastChild = listItem.children[listItem.children.length - 1];

  if (lastChild?.type === 'paragraph') {
    appendEllipsisToParagraph(lastChild as Paragraph);
    return;
  }

  listItem.children.push({
    type: 'paragraph',
    children: [{ type: 'text', value: TRUNCATION_ELLIPSIS } as Text],
  } as Paragraph);
};

const appendEllipsisToPreviewNode = (node: unknown): boolean => {
  if (!node || typeof node !== 'object') return false;

  const previewNode = node as { type?: string; value?: unknown; children?: unknown[] };

  if (previewNode.type === 'heading') {
    appendEllipsisToHeading(node as Heading);
    return true;
  }

  if (previewNode.type === 'paragraph') {
    appendEllipsisToParagraph(node as Paragraph);
    return true;
  }

  if (previewNode.type === 'list') {
    const lastListItem = (node as List).children[(node as List).children.length - 1];
    if (!lastListItem) return false;

    appendEllipsisToListItem(lastListItem);
    return true;
  }

  if (typeof previewNode.value === 'string') {
    previewNode.value = `${previewNode.value}${TRUNCATION_ELLIPSIS}`;
    return true;
  }

  const lastChild = previewNode.children?.[previewNode.children.length - 1];
  if (!lastChild) return false;

  return appendEllipsisToPreviewNode(lastChild);
};

interface ArticlePreviewState {
  remainingLines: number;
  remainingChars: number;
  hiddenContent: boolean;
  previewHasEllipsis: boolean;
}

const hasStringValue = (node: RootContent): node is RootContent & { value: string } => {
  return 'value' in node && typeof node.value === 'string';
};

const truncateValueNode = (node: RootContent & { value: string }, state: ArticlePreviewState): RootContent => {
  const lineCount = getPreviewLineCount(node.value);
  const nextNode = { ...node };

  if (node.value.length > state.remainingChars) {
    nextNode.value = truncateAtWordBoundary(node.value, state.remainingChars);
    state.remainingChars = 0;
  } else {
    nextNode.value = truncateAtLineLimit(node.value, state.remainingLines);
    state.remainingChars = Math.max(0, state.remainingChars - nextNode.value.length);
  }

  state.remainingLines = Math.max(0, state.remainingLines - Math.min(lineCount, state.remainingLines));
  state.hiddenContent = true;
  state.previewHasEllipsis = true;

  return nextNode;
};

const isTableNode = (node: RootContent): node is RootContent & { children: RootContent[] } => {
  return node.type === 'table' && 'children' in node && Array.isArray(node.children);
};

const handleTablePreview = (
  table: RootContent & { children: RootContent[] },
  previewChildren: RootContent[],
  state: ArticlePreviewState,
): void => {
  const rows: RootContent[] = [];

  for (const row of table.children) {
    if (state.remainingLines <= 0 || state.remainingChars <= 0) {
      state.hiddenContent = true;
      break;
    }

    rows.push(row);
    state.remainingLines -= 1;
    state.remainingChars = Math.max(0, state.remainingChars - extractText(row).length);
  }

  if (rows.length === 0) {
    state.hiddenContent = true;
    return;
  }

  previewChildren.push({ ...table, children: rows } as RootContent);
  if (rows.length < table.children.length) state.hiddenContent = true;
};

const extractListItemText = (listItem: ListItem): string => {
  return listItem.children.map((child) => extractText(child as RootContent)).join('');
};

const truncateAstListItem = (listItem: ListItem, limit: number): boolean => {
  let remaining = limit;
  const children: ListItem['children'] = [];
  let ellipsisAdded = false;

  for (const child of listItem.children) {
    if (remaining <= 0) break;

    if (child.type === 'paragraph') {
      const paragraph = child as Paragraph;
      const text = extractText(paragraph);

      if (text.length <= remaining) {
        children.push(child);
        remaining -= text.length;
      } else {
        truncateAstParagraph(paragraph, { limit: remaining, wordBoundary: true });
        children.push(paragraph);
        remaining = 0;
        ellipsisAdded = true;
      }
      continue;
    }

    const text = extractText(child as RootContent);
    if (text.length <= remaining) {
      children.push(child);
      remaining -= text.length;
    }
  }

  listItem.children = children.length > 0 ? children : listItem.children;
  return ellipsisAdded;
};

// Truncate text content within an AST paragraph node at a character limit,
// preserving formatting structure (bold, italic, links, etc.)
const truncateAstParagraph = (paragraph: Paragraph, truncation: PreviewTruncation): void => {
  const { limit, wordBoundary } = truncation;
  let remaining = limit;
  let ellipsisAdded = false;

  const truncateChildren = (children: PhrasingContent[]): PhrasingContent[] => {
    const result: PhrasingContent[] = [];

    for (const child of children) {
      if (remaining <= 0) break;

      if (child.type === 'text') {
        const text = (child as Text).value;
        if (text.length <= remaining) {
          result.push(child);
          remaining -= text.length;
        } else {
          result.push({
            type: 'text',
            value: wordBoundary
              ? truncateAtWordBoundary(text, remaining)
              : `${text.slice(0, remaining)}${TRUNCATION_ELLIPSIS}`,
          } as Text);
          remaining = 0;
          ellipsisAdded = true;
        }
      } else if ('children' in child) {
        const truncatedChildren = truncateChildren((child as Parent).children as PhrasingContent[]);
        if (truncatedChildren.length > 0) {
          result.push({ ...child, children: truncatedChildren } as PhrasingContent);
        }
      } else {
        result.push(child);
      }
    }

    return result;
  };

  paragraph.children = truncateChildren(paragraph.children);
  if (!ellipsisAdded) appendEllipsisToParagraph(paragraph);
};

const truncateAstHeading = (heading: Heading, truncation: PreviewTruncation): void => {
  const paragraph: Paragraph = {
    type: 'paragraph',
    children: heading.children,
  };

  truncateAstParagraph(paragraph, truncation);
  heading.children = paragraph.children;
};

interface TextPreviewNodeConfig<TNode extends Heading | Paragraph> {
  node: TNode;
  previewChildren: RootContent[];
  state: ArticlePreviewState;
  consumedLineCount: number;
  maxLineLimit: number;
  truncateNode: (node: TNode, truncation: PreviewTruncation) => void;
}

const appendTextPreviewNode = <TNode extends Heading | Paragraph>({
  node,
  previewChildren,
  state,
  consumedLineCount,
  maxLineLimit,
  truncateNode,
}: TextPreviewNodeConfig<TNode>): boolean => {
  const text = extractText(node);

  previewChildren.push(node as RootContent);
  state.remainingLines -= Math.min(consumedLineCount, state.remainingLines);

  if (text.length > state.remainingChars) {
    truncateNode(node, { limit: state.remainingChars, wordBoundary: true });
    state.previewHasEllipsis = true;
    state.hiddenContent = true;
    return true;
  }

  state.remainingChars -= text.length;

  const truncation = getPreviewTruncation(text, maxLineLimit);
  if (truncation) {
    truncateNode(node, truncation);
    state.previewHasEllipsis = true;
  }

  return false;
};

const buildArticlePreviewChildren = (children: RootContent[], state: ArticlePreviewState): RootContent[] => {
  const previewChildren: RootContent[] = [];

  for (const child of children) {
    if (state.remainingLines <= 0 || state.remainingChars <= 0) {
      state.hiddenContent = true;
      break;
    }

    if (child.type === 'heading') {
      const shouldStop = appendTextPreviewNode({
        node: child,
        previewChildren,
        state,
        consumedLineCount: 1,
        maxLineLimit: 1,
        truncateNode: truncateAstHeading,
      });
      if (shouldStop) break;
      continue;
    }

    if (child.type === 'paragraph') {
      const maxLinesForParagraph = state.remainingLines;
      const text = extractText(child);
      const shouldStop = appendTextPreviewNode({
        node: child,
        previewChildren,
        state,
        consumedLineCount: text.split(/\r\n|\n/).length,
        maxLineLimit: maxLinesForParagraph,
        truncateNode: truncateAstParagraph,
      });
      if (shouldStop) break;
      continue;
    }

    if (child.type === 'list') {
      const list = child as List;
      const listItems: ListItem[] = [];
      let listWasTruncated = false;

      for (const listItem of list.children) {
        if (state.remainingLines <= 0 || state.remainingChars <= 0) {
          listWasTruncated = true;
          break;
        }

        const text = extractListItemText(listItem);
        const nextListItem = { ...listItem, children: [...listItem.children] } as ListItem;

        if (text.length > state.remainingChars) {
          const listItemHasEllipsis = truncateAstListItem(nextListItem, state.remainingChars);
          listItems.push(nextListItem);
          state.remainingLines -= 1;
          state.remainingChars = 0;
          state.previewHasEllipsis = listItemHasEllipsis || state.previewHasEllipsis;
          listWasTruncated = true;
          break;
        }

        listItems.push(nextListItem);
        state.remainingLines -= 1;
        state.remainingChars -= text.length;
      }

      if (listItems.length === 0) {
        state.hiddenContent = true;
        break;
      }

      const nextList = {
        ...list,
        children: listItems,
      } as List;

      previewChildren.push(nextList);
      if (listWasTruncated || nextList.children.length < list.children.length) state.hiddenContent = true;
      continue;
    }

    if (child.type === 'blockquote') {
      const blockquote = child as Blockquote;
      const blockquoteChildren = buildArticlePreviewChildren(blockquote.children, state);

      if (blockquoteChildren.length === 0) {
        state.hiddenContent = true;
        break;
      }

      previewChildren.push({ ...blockquote, children: blockquoteChildren as Blockquote['children'] });
      continue;
    }

    if (isTableNode(child)) {
      handleTablePreview(child, previewChildren, state);
      continue;
    }

    const text = extractText(child);
    const lineCount = getPreviewLineCount(text);

    if (hasStringValue(child) && (text.length > state.remainingChars || lineCount > state.remainingLines)) {
      previewChildren.push(truncateValueNode(child, state));
      break;
    }

    previewChildren.push(child);
    state.remainingLines -= Math.min(lineCount, state.remainingLines);
    state.remainingChars = Math.max(0, state.remainingChars - text.length);
  }

  if (previewChildren.length < children.length) state.hiddenContent = true;

  return previewChildren;
};

// Remark plugin for articles: keeps a feed preview capped by source-like lines.
export const remarkExtractFirstParagraph = () => (tree: Root) => {
  const state: ArticlePreviewState = {
    remainingLines: POST_TEXT_PREVIEW_MAX_LINES,
    remainingChars: TRUNCATION_LIMIT,
    hiddenContent: false,
    previewHasEllipsis: false,
  };
  const previewChildren = buildArticlePreviewChildren(tree.children, state);

  if (previewChildren.length === 0) return;

  if (state.hiddenContent && !state.previewHasEllipsis) {
    const lastPreviewChild = previewChildren[previewChildren.length - 1];
    if (!appendEllipsisToPreviewNode(lastPreviewChild)) previewChildren.push(createEllipsisParagraph());
  }

  tree.children = previewChildren;
};

// Truncate text at word boundaries to avoid cutting mid-word, mid-markdown, or mid-URL.
// Falls back to hard cut if no suitable word boundary is found within 80% of the limit.
export const truncateAtWordBoundary = (text: string, limit: number): string => {
  if (text.length <= limit) return text;

  const truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(' ');

  // Only use word boundary if it's within 80% of the limit to avoid too-short truncation
  const minBoundary = Math.floor(limit * 0.8);

  return (lastSpace > minBoundary ? truncated.slice(0, lastSpace) : truncated) + TRUNCATION_ELLIPSIS;
};
