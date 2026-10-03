/**
 * Constants for the Markdown editor.
 *
 * CODE_BLOCK_LANGUAGES defines the languages available in the editor's code block dropdown.
 * LANGUAGE_ALIASES maps common shorthand/alternative names to supported language keys.
 * INLINE_MEDIA_KIND_UI names and draws each inline media kind.
 */

import { FileText, Image as ImageIcon, type LucideIcon, Music, Video } from 'lucide-react';
import type { InlineMediaKind } from '@/libs/file/inlineMediaKind';

/**
 * The label, icon and wrong-file copy of each inline media kind, shared by both toolbars, the insert
 * dialog and the in-editor node.
 */
export const INLINE_MEDIA_KIND_UI: Record<InlineMediaKind, { label: string; Icon: LucideIcon; wrongFile: string }> = {
  image: { label: 'Image', Icon: ImageIcon, wrongFile: 'Choose an image file.' },
  video: { label: 'Video', Icon: Video, wrongFile: 'Choose a video file.' },
  audio: { label: 'Audio', Icon: Music, wrongFile: 'Choose an audio file.' },
  pdf: { label: 'PDF', Icon: FileText, wrongFile: 'Choose a PDF file.' },
};

/**
 * Common programming languages for code blocks in the Markdown editor.
 * Keys are language identifiers used by CodeMirror, values are display names.
 */
export const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  plaintext: 'Plain Text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  markdown: 'Markdown',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  swift: 'Swift',
  kotlin: 'Kotlin',
  sql: 'SQL',
  bash: 'Bash',
  shell: 'Shell',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  graphql: 'GraphQL',
  docker: 'Dockerfile',
  diff: 'Diff',
};

/**
 * Common aliases for programming languages that map to supported code block language keys.
 * Used when switching from markdown mode to rich text mode to resolve user-typed
 * language identifiers to languages supported by the editor.
 */
export const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  zsh: 'bash',
  fish: 'bash',
  yml: 'yaml',
  dockerfile: 'docker',
  cs: 'csharp',
  'c++': 'cpp',
  'c#': 'csharp',
  text: 'plaintext',
  plain: 'plaintext',
  txt: 'plaintext',
  htm: 'html',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  gql: 'graphql',
  md: 'markdown',
  jsonc: 'json',
  json5: 'json',
};
