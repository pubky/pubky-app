'use client';

import { useState, useRef, type ForwardedRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ButtonWithTooltip,
  codeBlockPlugin,
  codeMirrorPlugin,
  CodeToggle,
  CreateLink,
  headingsPlugin,
  InsertCodeBlock,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  maxLengthPlugin,
  MDXEditor,
  type MDXEditorMethods,
  type MDXEditorProps,
  quotePlugin,
  StrikeThroughSupSubToggles,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { oneDark } from '@codemirror/theme-one-dark';
import { languages } from '@codemirror/language-data';
import { ARTICLE_MAX_CHARACTER_LENGTH } from '@/config';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Icons from '@/libs/icons';
import * as Utils from '@/libs/utils';
import * as Hooks from '@/hooks';

/**
 * Common programming languages for code blocks in the Markdown editor.
 * Keys are language identifiers used by CodeMirror, values are display names.
 */
const CODE_BLOCK_LANGUAGES: Record<string, string> = {
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
 * Preload all CodeMirror language support modules to prevent layout shift
 * when selecting a language for the first time in the code block dropdown.
 *
 * Without this, languages are lazy-loaded on first selection, causing a brief
 * flicker/resize of the parent dialog while the async import resolves.
 */
function preloadLanguages() {
  const languageKeys = Object.keys(CODE_BLOCK_LANGUAGES);

  languageKeys.forEach((langKey) => {
    // Find matching language description from @codemirror/language-data
    const langDesc = languages.find(
      (l) => l.name.toLowerCase() === langKey || l.alias?.some((alias) => alias.toLowerCase() === langKey),
    );

    // Trigger the async load - we don't need to await it, just start the import
    if (langDesc) {
      langDesc.load().catch(() => {
        // Silently ignore load failures - the editor will handle missing languages gracefully
      });
    }
  });
}

// Start preloading languages when this module is imported
preloadLanguages();

type EditorMode = 'richtext' | 'markdown';

// Only import this to MarkdownEditor.tsx
export default function InitializedMDXEditor({
  editorRef,
  readOnly,
  ...props
}: { editorRef: ForwardedRef<MDXEditorMethods> | null } & MDXEditorProps) {
  const t = useTranslations('markdownEditor');

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [maxLengthWarning, setMaxLengthWarning] = useState<null | 'approaching' | 'reached'>(null);
  const [mode, setMode] = useState<EditorMode>('richtext');
  const [richText, setRichText] = useState(props.markdown);
  const [markdownText, setMarkdownText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRichTextEmpty = richText.trim() === '';
  const isMarkdownEmpty = markdownText.trim() === '';

  const switchToMarkdownMode = () => {
    if (!isRichTextEmpty) return;
    setMode('markdown');
  };

  const switchToRichTextMode = () => {
    if (!isMarkdownEmpty) return;
    setMode('richtext');
  };

  const updateMaxLengthWarning = (text: string) => {
    const remaining = ARTICLE_MAX_CHARACTER_LENGTH - text.length;

    switch (true) {
      case remaining === 0:
        setMaxLengthWarning('reached');
        break;
      case remaining < 100:
        setMaxLengthWarning('approaching');
        break;
      default:
        setMaxLengthWarning(null);
    }
  };

  const handleMarkdownTextChange = (newText: string) => {
    if (newText.length > ARTICLE_MAX_CHARACTER_LENGTH) return;
    setMarkdownText(newText);
    updateMaxLengthWarning(newText);
    props.onChange?.(newText, false);
  };

  const handleMarkdownEmojiSelect = Hooks.useEmojiInsert({
    inputRef: textareaRef,
    value: markdownText,
    onChange: handleMarkdownTextChange,
  });

  const handleEmojiSelect = (emoji: { native: string }) => {
    if (mode === 'markdown') {
      handleMarkdownEmojiSelect(emoji);
    } else {
      if (editorRef && 'current' in editorRef) {
        editorRef.current?.focus();
        editorRef.current?.insertMarkdown(emoji.native);
        editorRef.current?.focus();
      }
    }
  };

  return (
    <Atoms.Container className="gap-4">
      {/* Markdown mode: custom toolbar + textarea — hidden via CSS in rich text mode */}
      <Atoms.Container overrideDefaults className={Utils.cn(mode === 'richtext' && 'hidden')}>
        <Atoms.Container
          overrideDefaults
          className="flex min-h-10.75 cursor-auto flex-wrap items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
          role="toolbar"
          aria-label={t('toolbarAriaLabel')}
          data-testid="markdown-toolbar"
        >
          <Atoms.Button
            variant="ghost"
            size="icon"
            title={t('emoji')}
            onClick={() => setShowEmojiPicker(true)}
            disabled={readOnly}
            className="size-7 cursor-default rounded"
            data-testid="markdown-emoji-button"
          >
            <Icons.Smile className="size-6" />
          </Atoms.Button>

          <Atoms.Button
            variant="ghost"
            size="icon"
            title={isMarkdownEmpty ? t('richText') : t('clearToSwitch')}
            onClick={switchToRichTextMode}
            disabled={readOnly || !isMarkdownEmpty}
            className="size-7 cursor-default rounded disabled:pointer-events-auto"
            data-testid="markdown-richtext-button"
          >
            <Icons.Type className="size-6" />
          </Atoms.Button>
        </Atoms.Container>

        <Atoms.Textarea
          ref={textareaRef}
          value={markdownText}
          onChange={(e) => handleMarkdownTextChange(e.target.value)}
          readOnly={readOnly}
          placeholder={t('placeholder')}
          maxLength={ARTICLE_MAX_CHARACTER_LENGTH}
          className="max-h-[60dvh] min-h-11 resize-none rounded-none border-none p-0 pt-4 shadow-none outline-none placeholder:text-muted-foreground/70 focus-visible:border-none focus-visible:ring-0"
          data-testid="markdown-textarea"
        />
      </Atoms.Container>

      {/* Rich text mode: MDXEditor (includes its own toolbar) — hidden via CSS in markdown mode */}
      <MDXEditor
        readOnly={readOnly}
        placeholder={t('placeholder')}
        className={Utils.cn('dark-theme cursor-auto', mode === 'markdown' && 'hidden')}
        contentEditableClassName="prose prose-neutral prose-invert prose-code:before:content-none prose-code:after:content-none max-w-none px-0! pb-0! pt-4! max-h-[60dvh] overflow-y-auto"
        plugins={[
          toolbarPlugin({
            toolbarClassName: 'bg-background! border rounded-md! flex-wrap',
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
                <StrikeThroughSupSubToggles options={['Strikethrough']} />
                <ListsToggle options={['bullet', 'number']} />
                <InsertThematicBreak />
                <CreateLink />
                <CodeToggle />
                <InsertCodeBlock />
                <ButtonWithTooltip title={t('emoji')} onClick={() => setShowEmojiPicker(true)}>
                  <Icons.Smile className="size-6" />
                </ButtonWithTooltip>
                <ButtonWithTooltip
                  title={isRichTextEmpty ? t('markdown') : t('clearToSwitch')}
                  onClick={switchToMarkdownMode}
                  disabled={!isRichTextEmpty}
                  className={Utils.cn(!isRichTextEmpty && 'opacity-50!')}
                >
                  <Icons.MarkdownMark className="size-6" />
                </ButtonWithTooltip>
              </>
            ),
          }),
          headingsPlugin(),
          quotePlugin(),
          listsPlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin({ showLinkTitleField: false }),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'plaintext' }),
          codeMirrorPlugin({
            codeBlockLanguages: CODE_BLOCK_LANGUAGES,
            codeMirrorExtensions: [oneDark],
          }),
          maxLengthPlugin(ARTICLE_MAX_CHARACTER_LENGTH),
        ]}
        {...props}
        onChange={(markdown, initialMarkdownNormalize) => {
          setRichText(markdown);
          updateMaxLengthWarning(markdown);
          props.onChange?.(markdown, initialMarkdownNormalize);
        }}
        ref={editorRef}
      />

      <Molecules.EmojiPickerDialog
        open={showEmojiPicker}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={handleEmojiSelect}
      />

      {maxLengthWarning && (
        <Atoms.Container
          className={Utils.cn(
            'cursor-auto flex-row items-center gap-x-2 rounded-md p-2',
            maxLengthWarning === 'approaching' && 'bg-yellow-500/15 text-yellow-500',
            maxLengthWarning === 'reached' && 'bg-red-500/15 text-red-500',
          )}
          data-testid="max-length-warning"
        >
          <Icons.AlertTriangle className="size-4 shrink-0" />

          <Atoms.Typography overrideDefaults className="text-sm">
            {maxLengthWarning === 'approaching' && t('warningApproaching')}
            {maxLengthWarning === 'reached' && t('warningReached')}
          </Atoms.Typography>
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
