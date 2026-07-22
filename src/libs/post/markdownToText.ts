/**
 * Converts Markdown source into a clean, single-line plain-text approximation,
 * suitable for a short preview excerpt (e.g. an Open Graph image body preview).
 *
 * This is intentionally a lightweight, dependency-free stripper — NOT a
 * spec-compliant parser. It errs toward readable output for typical article
 * prose, covers the common Markdown/GFM constructs, and never throws. Exotic or
 * malformed input degrades gracefully (leftover literal punctuation) rather than
 * producing garbage or errors.
 *
 * Guiding rules for edge cases:
 *  - Backslash-escaped punctuation (`\*`, `\#`, …) is treated as a literal and
 *    never interpreted as Markdown.
 *  - Links keep their visible text; images are dropped; code blocks are dropped.
 *  - Underscore emphasis is only unwrapped at word boundaries, so intraword
 *    underscores (`snake_case`) survive.
 *  - Everything collapses to a single whitespace-normalized line.
 */

// Private-use-area sentinels wrapping an index, used to shield escaped literals
// from the Markdown rules below. They cannot occur in real content.
const ESCAPE_OPEN = String.fromCharCode(0xe000);
const ESCAPE_CLOSE = String.fromCharCode(0xe001);

export function markdownToText(markdown: string | null | undefined): string {
  if (!markdown) return '';

  let text = markdown.replace(/\r\n?/g, '\n');

  // Protect backslash-escaped punctuation up front so no rule below reinterprets
  // it as Markdown (e.g. `\*literal\*` must not be unwrapped as emphasis).
  const escapes: string[] = [];
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_match, char: string) => {
    const token = `${ESCAPE_OPEN}${escapes.length}${ESCAPE_CLOSE}`;
    escapes.push(char);
    return token;
  });

  // Fenced code blocks (``` or ~~~), with or without a language hint.
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, ' ');
  // Any leftover (unterminated) fence line.
  text = text.replace(/^[ \t]*(?:`{3,}|~{3,}).*$/gm, ' ');

  // HTML comments.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // Images: ![alt](url) / ![alt][ref] -> drop entirely.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ');

  // Links: [text](url) / [text][ref] -> keep the visible text.
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');

  // Link / footnote reference definitions on their own line -> drop (before the
  // inline footnote-reference rule, which would otherwise eat the `[^id]` label).
  text = text.replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S.*$/gm, ' ');
  // Inline footnote references [^id] -> drop.
  text = text.replace(/\[\^[^\]]+\]/g, '');

  // Autolinks <https://…> / <mailto:…> -> keep the url.
  text = text.replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1');
  // Remaining HTML tags -> strip.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');

  // ATX headings: leading #'s and any trailing closing #'s.
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  text = text.replace(/[ \t]+#+[ \t]*$/gm, '');

  // Blockquotes: leading (possibly nested) > markers.
  text = text.replace(/^[ \t]{0,3}(?:>[ \t]?)+/gm, '');

  // Task-list + list markers (unordered and ordered).
  text = text.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, '');
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
  text = text.replace(/^[ \t]*\d+[.)][ \t]+/gm, '');

  // Thematic breaks / setext underlines on their own line.
  text = text.replace(/^[ \t]*([-*_=])(?:[ \t]*\1){2,}[ \t]*$/gm, ' ');

  // GFM table delimiter rows (only pipes / colons / dashes / spaces) -> drop.
  text = text.replace(/^[ \t]*[|:\- \t]*-[|:\- \t]*$/gm, ' ');
  // Table pipe borders -> spaces (cell text is preserved).
  text = text.replace(/\|/g, ' ');

  // Inline code `code` -> code.
  text = text.replace(/`+([^`]+?)`+/g, '$1');

  // Emphasis: asterisks (may be intraword). Run twice to unwrap nesting.
  for (let i = 0; i < 2; i += 1) {
    text = text.replace(/(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?\S)\1/g, '$2');
  }
  // Emphasis: underscores only at word boundaries (intraword `_` is literal).
  text = text.replace(/(?<!\w)(___|__|_)(?=\S)([\s\S]*?\S)\1(?!\w)/g, '$2');
  // Strikethrough.
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1');

  // Leftover unmatched inline-code backticks.
  text = text.replace(/`/g, '');

  // Collapse all whitespace to single spaces and trim.
  text = text.replace(/\s+/g, ' ').trim();

  // Restore protected escaped literals.
  text = text.replace(new RegExp(`${ESCAPE_OPEN}(\\d+)${ESCAPE_CLOSE}`, 'g'), (_match, index: string) => {
    return escapes[Number(index)] ?? '';
  });

  return text;
}
