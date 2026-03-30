/**
 * Utility for sanitizing fenced code block languages in markdown text.
 *
 * When users type markdown manually (in markdown mode), they may use language
 * identifiers that are not supported by the editor's codeMirrorPlugin. This
 * utility resolves those identifiers to supported languages before the markdown
 * is passed to the rich text editor, preventing crashes.
 */

import { CODE_BLOCK_LANGUAGES, LANGUAGE_ALIASES } from './InitializedMDXEditor.constants';

/**
 * Resolves a language identifier to a supported code block language key.
 * Checks the supported languages map first (case-insensitive), then common
 * aliases, and falls back to 'plaintext' if unrecognized.
 *
 * @param lang - The language identifier to resolve (e.g. 'js', 'TypeScript', 'unknownlang')
 * @returns A supported language key, guaranteed to exist in CODE_BLOCK_LANGUAGES
 */
export function resolveCodeBlockLanguage(lang: string): string {
  const lower = lang.toLowerCase();

  // Direct match in supported languages
  if (CODE_BLOCK_LANGUAGES[lower]) return lower;

  // Alias match — but only if the alias target is actually supported
  const aliased = LANGUAGE_ALIASES[lower];
  if (aliased && CODE_BLOCK_LANGUAGES[aliased]) return aliased;

  return 'plaintext';
}

/**
 * Sanitizes fenced code blocks in markdown text to ensure all code blocks
 * have a language identifier supported by the editor's codeMirrorPlugin.
 *
 * Handles:
 * - Code blocks with no language → adds 'plaintext'
 * - Code blocks with unsupported languages → resolves via aliases or falls back to 'plaintext'
 * - Both backtick (```) and tilde (~~~) fenced code blocks
 * - Proper tracking of opening/closing fences (doesn't modify content inside code blocks)
 * - Up to 3 spaces of indentation before fences (per CommonMark spec)
 * - Varying fence lengths (3+ characters)
 * - Info strings after the language identifier are preserved
 * - Case-insensitive language matching
 *
 * Limitations:
 * - Does not handle code blocks nested inside blockquotes (> ``` prefix)
 *
 * @param markdown - Raw markdown text to sanitize
 * @returns Sanitized markdown with all code block languages resolved to supported values
 */
export function sanitizeCodeBlockLanguages(markdown: string): string {
  // Handle edge cases
  if (!markdown) return markdown;

  // Fast path: skip line-by-line processing when there are no fence characters
  if (!markdown.includes('`') && !markdown.includes('~')) return markdown;

  // Normalize line endings for consistent processing
  const lines = markdown.split(/\r?\n/);
  const result: string[] = [];
  let insideCodeBlock = false;
  let currentFenceChar = '';
  let currentFenceLength = 0;

  for (const line of lines) {
    if (insideCodeBlock) {
      // Check for closing fence: same char type, at least as long, no info string
      // Per CommonMark spec, closing fence can have up to 3 spaces of indentation
      const closingMatch = line.match(/^( {0,3})((`{3,})|(~{3,}))\s*$/);

      if (closingMatch) {
        const fenceChar = closingMatch[3] ? '`' : '~';
        const fenceLength = (closingMatch[3] || closingMatch[4]).length;

        // Closing fence must use the same character and be at least as long
        if (fenceChar === currentFenceChar && fenceLength >= currentFenceLength) {
          insideCodeBlock = false;
        }
      }

      // Content inside code blocks is never modified
      result.push(line);
    } else {
      // Check for opening fence
      // Backtick fences: info string CANNOT contain backtick characters (CommonMark spec)
      const backtickMatch = line.match(/^( {0,3})(`{3,})([^`]*)$/);
      // Tilde fences: info string CAN contain any characters (including backticks)
      // Only check for tilde if backtick didn't match to avoid ambiguity
      const tildeMatch = !backtickMatch ? line.match(/^( {0,3})(~{3,})(.*)$/) : null;
      const openingMatch = backtickMatch || tildeMatch;

      if (openingMatch) {
        const indent = openingMatch[1];
        const fence = openingMatch[2];
        const fenceChar = fence[0];
        const rawInfoString = openingMatch[3];
        const infoString = rawInfoString.trim();

        insideCodeBlock = true;
        currentFenceChar = fenceChar;
        currentFenceLength = fence.length;

        if (infoString === '') {
          // No language specified — add plaintext
          result.push(`${indent}${fence}plaintext`);
        } else {
          // Extract language (first word of info string)
          const firstSpaceIndex = infoString.search(/\s/);
          const lang = firstSpaceIndex === -1 ? infoString : infoString.slice(0, firstSpaceIndex);
          const rest = firstSpaceIndex === -1 ? '' : infoString.slice(firstSpaceIndex);
          const resolvedLang = resolveCodeBlockLanguage(lang);

          result.push(`${indent}${fence}${resolvedLang}${rest}`);
        }
      } else {
        result.push(line);
      }
    }
  }

  return result.join('\n');
}
