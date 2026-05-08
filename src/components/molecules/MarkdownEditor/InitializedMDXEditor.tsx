'use client';

import '@mdxeditor/editor/style.css';
import { type ForwardedRef, useRef, useState } from 'react';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
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
import { AlertTriangle, Smile, Type } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { ARTICLE_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useEmojiInsert } from '@/hooks/useEmojiInsert/useEmojiInsert';
import { MarkdownMark } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { EmojiPickerDialog } from '../EmojiPickerDialog/EmojiPickerDialog';
import { CODE_BLOCK_LANGUAGES } from './InitializedMDXEditor.constants';
import { sanitizeCodeBlockLanguages } from './InitializedMDXEditor.utils';

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
}: {
  editorRef: ForwardedRef<MDXEditorMethods> | null;
} & MDXEditorProps) {
  const t = useTranslations('markdownEditor');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [maxLengthWarning, setMaxLengthWarning] = useState<null | 'approaching' | 'reached'>(null);
  const [mode, setMode] = useState<EditorMode>('richtext');
  const [markdownText, setMarkdownText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const switchToMarkdownMode = () => {
    if (editorRef && 'current' in editorRef) {
      const markdown = editorRef.current?.getMarkdown() ?? '';
      setMarkdownText(markdown);
      setMode('markdown');
    }
  };
  const switchToRichTextMode = () => {
    if (editorRef && 'current' in editorRef) {
      // Sanitize code block languages before passing to the rich text editor.
      // This prevents crashes from unsupported or missing language identifiers
      // in fenced code blocks (e.g. ``` with no language, or ```haskell).
      const sanitized = sanitizeCodeBlockLanguages(markdownText);
      editorRef.current?.setMarkdown(sanitized);
      updateMaxLengthWarning(sanitized);
      setMode('richtext');
    }
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
  const handleMarkdownEmojiSelect = useEmojiInsert({
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
    <Container className="gap-4">
      {/* Markdown mode: custom toolbar + textarea — hidden via CSS in rich text mode */}
      <Container overrideDefaults className={cn(mode === 'richtext' && 'hidden')}>
        <Container
          overrideDefaults
          className="flex min-h-10.75 cursor-auto flex-wrap items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
          role="toolbar"
          aria-label={t('toolbarAriaLabel')}
          data-testid="markdown-toolbar"
        >
          <Button
            variant="ghost"
            size="icon"
            title={t('emoji')}
            onClick={() => setShowEmojiPicker(true)}
            disabled={readOnly}
            className="size-7 cursor-default rounded"
            data-testid="markdown-emoji-button"
          >
            <Smile className="size-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            title={t('richText')}
            onClick={switchToRichTextMode}
            disabled={readOnly}
            className="size-7 cursor-default rounded"
            data-testid="markdown-richtext-button"
          >
            <Type className="size-6" />
          </Button>
        </Container>

        <Textarea
          ref={textareaRef}
          value={markdownText}
          onChange={(e) => handleMarkdownTextChange(e.target.value)}
          readOnly={readOnly}
          placeholder={t('placeholder')}
          maxLength={ARTICLE_MAX_CHARACTER_LENGTH}
          variant="inline"
          className="max-h-[60dvh] min-h-11 rounded-none pt-4 font-normal text-foreground placeholder:text-muted-foreground/70"
          data-testid="markdown-textarea"
        />
      </Container>

      {/* Rich text mode: MDXEditor (includes its own toolbar) — hidden via CSS in markdown mode */}
      <MDXEditor
        readOnly={readOnly}
        placeholder={t('placeholder')}
        className={cn('dark-theme cursor-auto', mode === 'markdown' && 'hidden')}
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
                  <Smile className="size-6" />
                </ButtonWithTooltip>
                <ButtonWithTooltip title={t('markdown')} onClick={switchToMarkdownMode}>
                  <MarkdownMark className="size-6" />
                </ButtonWithTooltip>
              </>
            ),
          }),
          headingsPlugin(),
          quotePlugin(),
          listsPlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin({
            showLinkTitleField: false,
          }),
          codeBlockPlugin({
            defaultCodeBlockLanguage: 'plaintext',
          }),
          codeMirrorPlugin({
            codeBlockLanguages: CODE_BLOCK_LANGUAGES,
            codeMirrorExtensions: [oneDark],
          }),
          maxLengthPlugin(ARTICLE_MAX_CHARACTER_LENGTH),
        ]}
        {...props}
        onChange={(markdown, initialMarkdownNormalize) => {
          updateMaxLengthWarning(markdown);
          props.onChange?.(markdown, initialMarkdownNormalize);
        }}
        ref={editorRef}
      />

      <EmojiPickerDialog open={showEmojiPicker} onOpenChange={setShowEmojiPicker} onEmojiSelect={handleEmojiSelect} />

      {maxLengthWarning && (
        <Container
          className={cn(
            'cursor-auto flex-row items-center gap-x-2 rounded-md p-2',
            maxLengthWarning === 'approaching' && 'bg-yellow-500/15 text-yellow-500',
            maxLengthWarning === 'reached' && 'bg-red-500/15 text-red-500',
          )}
          data-testid="max-length-warning"
        >
          <AlertTriangle className="size-4 shrink-0" />

          <Typography overrideDefaults className="text-sm">
            {maxLengthWarning === 'approaching' && t('warningApproaching')}
            {maxLengthWarning === 'reached' && t('warningReached')}
          </Typography>
        </Container>
      )}
    </Container>
  );
}
