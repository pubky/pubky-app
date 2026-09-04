'use client';

import '@mdxeditor/editor/style.css';
import { type ForwardedRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  imageDialogState$,
  imagePlugin,
  InsertCodeBlock,
  InsertImage,
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
import { useCellValues } from '@mdxeditor/gurx';
import { AlertTriangle, Image as ImageIcon, Smile, Type } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import {
  ARTICLE_ATTACHMENT_ACCEPT_STRING,
  ARTICLE_MAX_CHARACTER_LENGTH,
  ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES,
} from '@/config/posts';
import { useEmojiInsert } from '@/hooks/useEmojiInsert/useEmojiInsert';
import { MarkdownMark } from '@/icons';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { cn } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import { FileVariant } from '@/services/nexus/file/file.types';
import { EmojiPickerDialog } from '../EmojiPickerDialog/EmojiPickerDialog';
import { CODE_BLOCK_LANGUAGES } from './InitializedMDXEditor.constants';
import { sanitizeCodeBlockLanguages } from './InitializedMDXEditor.utils';
import type { MarkdownEditorInlineImages } from './MarkdownEditor.types';
import { MarkdownEditorImageDialog } from './MarkdownEditorImageDialog';

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

/**
 * Invisible bridge rendered inside the editor toolbar (and therefore inside
 * the MDXEditor realm) that mirrors the image dialog's open state out to the
 * host component — used to show a single uploading indicator at a time (the
 * dialog has its own spinner).
 */
function ImageDialogOpenReporter({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [dialogState] = useCellValues(imageDialogState$);
  const isOpen = dialogState.type !== 'inactive';

  useEffect(() => {
    onOpenChange(isOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOpenChange is a stable setState
  }, [isOpen]);

  return null;
}

// Only import this to MarkdownEditor.tsx
export default function InitializedMDXEditor({
  editorRef,
  readOnly,
  inlineImages,
  ...props
}: {
  editorRef: ForwardedRef<MDXEditorMethods> | null;
  inlineImages?: MarkdownEditorInlineImages;
} & MDXEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [maxLengthWarning, setMaxLengthWarning] = useState<null | 'approaching' | 'reached'>(null);
  const [mode, setMode] = useState<EditorMode>('richtext');
  const [markdownText, setMarkdownText] = useState('');
  // Host element for MDXEditor's popups (link dialog, tooltips). Without it, MDXEditor
  // portals popups to document.body — outside the Radix Dialog hosting the article
  // composer, whose focus trap then pulls focus straight back to the contentEditable,
  // so the link dialog's URL input never receives the autofocus and typing overwrites
  // the selected text. Mounting the popups in-tree keeps them inside the focus trap.
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const markdownImageInputRef = useRef<HTMLInputElement>(null);
  // Synchronous mirror of markdownText: the async image-upload flows read and
  // splice the freshest text through this ref, so back-to-back placeholder
  // swaps never operate on a stale value while a render is still pending.
  const markdownTextRef = useRef('');

  const switchToMarkdownMode = () => {
    if (editorRef && 'current' in editorRef) {
      const markdown = editorRef.current?.getMarkdown() ?? '';
      markdownTextRef.current = markdown;
      setMarkdownText(markdown);
      // Serialized markdown can be longer than the rich-text character count
      // (image URIs count ~0 there) — surface the cap state on import
      updateMaxLengthWarning(markdown);
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
      // <= 0: a body can arrive over the cap (deserialized refs expand to
      // longer URIs; rich-text counts Lexical text, markdown counts source)
      case remaining <= 0:
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
    // Refuse growth past the cap, but always accept edits that shrink the
    // text — otherwise an over-cap body (see updateMaxLengthWarning) rejects
    // every keystroke including the deletions needed to get back under
    if (newText.length > ARTICLE_MAX_CHARACTER_LENGTH && newText.length >= markdownTextRef.current.length) return;
    markdownTextRef.current = newText;
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

  /** A unique `![Uploading name…]()` marker for the file, GitHub-style. */
  const makeUploadingPlaceholder = (fileName: string, existingText: string): string => {
    const base = `![Uploading ${fileName}…]()`;
    if (!existingText.includes(base)) return base;
    let counter = 2;
    while (existingText.includes(`![Uploading ${fileName} (${counter})…]()`)) counter += 1;
    return `![Uploading ${fileName} (${counter})…]()`;
  };

  /**
   * Swaps an uploading placeholder in place, preserving the user's caret. A
   * missing placeholder means the user deleted it — that cancels the
   * insertion (the uploaded file is swept as an unreferenced session upload
   * on publish/discard).
   */
  const replaceMarkdownPlaceholder = (placeholder: string, replacement: string) => {
    const textarea = textareaRef.current;
    const current = markdownTextRef.current;
    const index = current.indexOf(placeholder);
    if (index === -1) return;

    const next = current.slice(0, index) + replacement + current.slice(index + placeholder.length);
    if (replacement && next.length > ARTICLE_MAX_CHARACTER_LENGTH) {
      // No room for the real markdown — drop the placeholder instead of
      // leaving it stuck (handleMarkdownTextChange refuses over-cap text)
      replaceMarkdownPlaceholder(placeholder, '');
      toast({ variant: 'error', description: 'Not enough space left in the article for the image.' });
      return;
    }

    const selectionStart = textarea?.selectionStart ?? next.length;
    const selectionEnd = textarea?.selectionEnd ?? next.length;
    handleMarkdownTextChange(next);

    // Controlled updates park the caret at the end; restore it after render,
    // shifted by the swap delta when it sat behind the placeholder
    const delta = replacement.length - placeholder.length;
    const adjust = (position: number) => (position > index ? Math.max(index, position + delta) : position);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(adjust(selectionStart), adjust(selectionEnd));
    });
  };

  /**
   * Markdown-mode image insertion with a visible loading state: an
   * `![Uploading name…]()` placeholder lands at the caret immediately, then
   * each finished upload swaps its placeholder for the file-URI markdown in
   * place — or removes it on failure (the upload handler toasts the error).
   * The insert-after-success invariant holds: a placeholder never contains a
   * URI, and a failed upload leaves no markdown behind.
   */
  const uploadAndInsertInMarkdownMode = async (files: File[]) => {
    if (!inlineImages || files.length === 0) return;

    const current = markdownTextRef.current;
    const offset = Math.min(textareaRef.current?.selectionStart ?? current.length, current.length);

    const placeholders: string[] = [];
    let accumulated = current;
    for (const file of files) {
      const placeholder = makeUploadingPlaceholder(file.name, accumulated);
      placeholders.push(placeholder);
      accumulated += placeholder;
    }

    const snippet = placeholders.join('\n');
    const next = current.slice(0, offset) + snippet + current.slice(offset);
    if (next.length > ARTICLE_MAX_CHARACTER_LENGTH) {
      // Checked before uploading anything, so blocking here leaves no orphans
      toast({ variant: 'error', description: 'Not enough space left in the article for the image.' });
      return;
    }

    handleMarkdownTextChange(next);
    const caretAfterSnippet = offset + snippet.length;
    requestAnimationFrame(() => {
      const textareaElement = textareaRef.current;
      if (!textareaElement) return;
      // Restore focus (the toolbar button's native file chooser steals it)
      // and park the caret after the inserted placeholders. Later placeholder
      // swaps deliberately do NOT focus — the user may be typing elsewhere.
      textareaElement.focus();
      textareaElement.setSelectionRange(caretAfterSnippet, caretAfterSnippet);
    });

    // Sequential uploads keep each placeholder swap operating on the freshest
    // textarea content
    for (const [index, file] of files.entries()) {
      try {
        const uri = await inlineImages.upload(file);
        replaceMarkdownPlaceholder(placeholders[index], `![](${uri})`);
      } catch {
        // The upload handler already surfaced the failure to the user
        replaceMarkdownPlaceholder(placeholders[index], '');
      }
    }
  };

  const handleMarkdownImageInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Allow re-selecting the same file later
    event.target.value = '';
    void uploadAndInsertInMarkdownMode(files);
  };

  const handleMarkdownTextareaPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!inlineImages || readOnly) return;

    // File-first, like GitHub: real clipboards bundle image files with
    // text/html flavors (screenshots, images copied from apps), so any image
    // file wins over the accompanying text. Text-only payloads paste normally.
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null && ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type));
    if (files.length === 0) return;

    // preventDefault (without stopPropagation) also signals the composer
    // container's paste handler to leave these files to the article body.
    event.preventDefault();
    void uploadAndInsertInMarkdownMode(files);
  };

  const handleMarkdownTextareaDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    if (!inlineImages || readOnly) return;

    // Supported image types only (not image/* — e.g. HEIC would flash a
    // placeholder the upload then rejects); anything else bubbles to the
    // composer container, whose handler shows the unsupported-type toast
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type),
    );
    if (files.length === 0) return;

    // preventDefault only: the event still bubbles so the composer container
    // resets its drag state, but its defaultPrevented guard skips the files.
    event.preventDefault();
    void uploadAndInsertInMarkdownMode(files);
  };
  return (
    <Container className="gap-4">
      {/* Markdown mode: custom toolbar + textarea — hidden via CSS in rich text mode */}
      <Container overrideDefaults className={cn(mode === 'richtext' && 'hidden')}>
        <Container
          overrideDefaults
          className="flex min-h-10.75 cursor-auto flex-wrap items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
          role="toolbar"
          aria-label={'Markdown editing toolbar'}
          data-testid="markdown-toolbar"
        >
          <Button
            variant="ghost"
            size="icon"
            title={'Emoji'}
            onClick={() => setShowEmojiPicker(true)}
            disabled={readOnly}
            className="size-7 cursor-default rounded disabled:pointer-events-auto disabled:opacity-100"
            data-testid="markdown-emoji-button"
          >
            <Smile className="size-6" />
          </Button>

          {inlineImages && (
            <>
              <Button
                variant="ghost"
                size="icon"
                title={'Image'}
                onClick={() => markdownImageInputRef.current?.click()}
                disabled={readOnly}
                className="size-7 cursor-default rounded disabled:pointer-events-auto disabled:opacity-100"
                data-testid="markdown-image-button"
              >
                <ImageIcon className="size-6" />
              </Button>

              <Input
                ref={markdownImageInputRef}
                type="file"
                accept={ARTICLE_ATTACHMENT_ACCEPT_STRING}
                multiple
                className="hidden"
                onChange={handleMarkdownImageInputChange}
                data-testid="markdown-image-input"
              />
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            title={'Rich Text'}
            onClick={switchToRichTextMode}
            // Mode switches while an upload is in flight would strand the
            // async placeholder swap in the hidden editor pane
            disabled={readOnly || (inlineImages?.uploadingCount ?? 0) > 0}
            className="size-7 cursor-default rounded disabled:pointer-events-auto disabled:opacity-100"
            data-testid="markdown-richtext-button"
          >
            <Type className="size-6" />
          </Button>
        </Container>

        <Textarea
          ref={textareaRef}
          value={markdownText}
          onChange={(e) => handleMarkdownTextChange(e.target.value)}
          onPaste={handleMarkdownTextareaPaste}
          onDrop={handleMarkdownTextareaDrop}
          readOnly={readOnly}
          placeholder={'Start writing your masterpiece'}
          maxLength={ARTICLE_MAX_CHARACTER_LENGTH}
          variant="inline"
          className="max-h-[60dvh] min-h-11 rounded-none pt-4 font-normal text-foreground placeholder:text-muted-foreground/70"
          data-testid="markdown-textarea"
          // Suppress the iOS keyboard autofill accessory bar (passwords/cards/contacts)
          autoComplete="off"
        />
      </Container>

      {/* Out-of-flow (absolute, zero-size) so it adds no flex gap; popup contents position themselves fixed */}
      <div ref={setOverlayContainer} data-testid="mdx-editor-overlay-container" className="absolute" />

      {/* Rich text mode: MDXEditor (includes its own toolbar) — hidden via CSS in markdown mode */}
      <MDXEditor
        readOnly={readOnly}
        overlayContainer={overlayContainer}
        placeholder={'Start writing your masterpiece'}
        className={cn('dark-theme cursor-auto', mode === 'markdown' && 'hidden')}
        // leading-6, font-medium and text-secondary-foreground mirror PostText's
        // article body text so the editor previews the published spacing (WYSIWYG).
        contentEditableClassName="prose prose-neutral prose-invert prose-code:before:content-none prose-code:after:content-none max-w-none leading-6 font-medium text-secondary-foreground px-0! pb-0! pt-4! max-h-[60dvh] overflow-y-auto"
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
                {inlineImages && <InsertImage />}
                {inlineImages && <ImageDialogOpenReporter onOpenChange={setIsImageDialogOpen} />}
                <CodeToggle />
                <InsertCodeBlock />
                <ButtonWithTooltip title={'Emoji'} onClick={() => setShowEmojiPicker(true)}>
                  <Smile className="size-6" />
                </ButtonWithTooltip>
                <ButtonWithTooltip
                  title={'Markdown'}
                  onClick={switchToMarkdownMode}
                  // Mode switches while an upload is in flight would insert the
                  // async result into the hidden editor pane
                  disabled={(inlineImages?.uploadingCount ?? 0) > 0}
                >
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
          ...(inlineImages
            ? [
                imagePlugin({
                  imageUploadHandler: inlineImages.upload,
                  // Browsers can't load pubky:// URIs: prefer the session's
                  // local object URL (also covers the CDN variant-readiness
                  // window right after upload), then the Nexus CDN URL, then
                  // pass external URLs through untouched.
                  imagePreviewHandler: async (imageSource) =>
                    inlineImages.getPreviewUrl(imageSource) ??
                    pubkyUriToCdnUrl(imageSource, FileVariant.MAIN) ??
                    imageSource,
                  // CRITICAL: resized images serialize as raw HTML <img> mdast
                  // nodes, escaping the AST-based attachment rewrite on publish.
                  disableImageResize: true,
                  // App-styled responsive dialog with an upload loading state
                  ImageDialog: MarkdownEditorImageDialog,
                }),
              ]
            : []),
        ]}
        {...props}
        onChange={(markdown, initialMarkdownNormalize) => {
          updateMaxLengthWarning(markdown);
          props.onChange?.(markdown, initialMarkdownNormalize);
        }}
        ref={editorRef}
      />

      {/* Rich-text paste/drop uploads have no dialog or placeholder, so this
          pill is the only feedback while they're in flight. Portaled to the
          body and fixed to the viewport (like a toast): every in-dialog anchor
          can scroll out of view when a long article makes the dialog scroll.
          Hidden while the image dialog is open — its Save button already
          shows the uploading state, and two indicators at once is confusing. */}
      {mode === 'richtext' &&
        !isImageDialogOpen &&
        (inlineImages?.uploadingCount ?? 0) > 0 &&
        createPortal(
          <Container
            overrideDefaults
            className="fixed bottom-6 left-1/2 z-60 flex -translate-x-1/2 cursor-auto flex-row items-center gap-x-2 rounded-full border bg-background px-3 py-1.5 shadow-md"
            data-testid="richtext-uploading-indicator"
          >
            <Spinner size="sm" />
            <Typography overrideDefaults className="text-sm text-muted-foreground">
              {(inlineImages?.uploadingCount ?? 0) > 1
                ? `Uploading ${inlineImages?.uploadingCount} images…`
                : 'Uploading image…'}
            </Typography>
          </Container>,
          document.body,
        )}

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
            {maxLengthWarning === 'approaching' && "You're approaching the maximum character limit."}
            {maxLengthWarning === 'reached' && "You've reached the maximum character limit."}
          </Typography>
        </Container>
      )}
    </Container>
  );
}
