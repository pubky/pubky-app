import type { Link, Paragraph, Parent, PhrasingContent, Root, RootContent, Table, TableCell, Text } from 'mdast';
import { visit } from 'unist-util-visit';

// Recursively extract text from a node and all its descendants.
// Handles nested formatting like [**bold** and _italic_](url) -> "bold and italic"
export const extractText = (node: RootContent | PhrasingContent): string => {
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
