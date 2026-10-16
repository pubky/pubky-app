'use client';

import '@mdxeditor/editor/style.css';
import { type ForwardedRef, Fragment, useRef, useState } from 'react';
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
import { AlertTriangle, Smile, Type } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import {
  ARTICLE_INLINE_ACCEPT_STRING_BY_KIND,
  ARTICLE_INLINE_SUPPORTED_MIME_TYPES,
  ARTICLE_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { useEmojiInsert } from '@/hooks/useEmojiInsert/useEmojiInsert';
import { MarkdownMark } from '@/icons';
import { getInlineMediaKindFromMime, INLINE_MEDIA_KINDS, type InlineMediaKind } from '@/libs/file/inlineMediaKind';
import { pubkyUriToCdnUrl } from '@/libs/file/pubkyFileCdnUrl';
import { cn } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import { FileVariant } from '@/services/nexus/file/file.types';
import { EmojiPickerDialog } from '../EmojiPickerDialog/EmojiPickerDialog';
import { CODE_BLOCK_LANGUAGES, INLINE_MEDIA_KIND_UI } from './InitializedMDXEditor.constants';
import { sanitizeCodeBlockLanguages } from './InitializedMDXEditor.utils';
import { inlineMediaPlugin } from './inlineMediaPlugin';
import { InsertInlineMediaButton } from './InsertInlineMediaButton';
import type { MarkdownEditorInlineMedia } from './MarkdownEditor.types';
import { MarkdownEditorMediaDialog } from './MarkdownEditorMediaDialog';

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
  inlineMedia,
  ...props
}: {
  editorRef: ForwardedRef<MDXEditorMethods> | null;
  inlineMedia?: MarkdownEditorInlineMedia;
} & MDXEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
  // One hidden file input per media kind, so each toolbar button opens a picker filtered to its kind
  const markdownMediaInputRefs = useRef<Partial<Record<InlineMediaKind, HTMLInputElement | null>>>({});

  // Browsers can't load pubky:// URIs: prefer the session's local object URL (also covers the CDN
  // variant-readiness window right after upload), then the Nexus CDN URL, then pass an external
  // URL through untouched. Shared by the image previews and the video/audio/PDF nodes.
  const resolvePreview = (source: string) =>
    inlineMedia?.getPreviewUrl(source) ?? pubkyUriToCdnUrl(source, FileVariant.MAIN) ?? source;
  // Synchronous mirror of markdownText: the async media-insert flows read and
  // splice the freshest text through this ref, so back-to-back placeholder
  // swaps never operate on a stale value while a render is still pending.
  const markdownTextRef = useRef('');
  // The selection a placeholder swap scheduled but has not applied yet (the
  // caret moves on the next frame): a swap in the same tick adjusts it instead
  // of the stale DOM selection, so a batch of files leaves the caret after the
  // whole inserted block and not inside the first file's URI.
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

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
      toast({ variant: 'error', description: 'Not enough space left in the article for the file.' });
      return;
    }

    const selection = pendingSelectionRef.current ?? {
      start: textarea?.selectionStart ?? next.length,
      end: textarea?.selectionEnd ?? next.length,
    };
    handleMarkdownTextChange(next);

    // Controlled updates park the caret at the end; restore it after render,
    // shifted by the swap delta when it sat behind the placeholder
    const delta = replacement.length - placeholder.length;
    const adjust = (position: number) => (position > index ? Math.max(index, position + delta) : position);
    const adjusted = { start: adjust(selection.start), end: adjust(selection.end) };
    pendingSelectionRef.current = adjusted;
    requestAnimationFrame(() => {
      if (pendingSelectionRef.current === adjusted) pendingSelectionRef.current = null;
      textareaRef.current?.setSelectionRange(adjusted.start, adjusted.end);
    });
  };

  /**
   * Markdown-mode media insertion: an `![Uploading name…]()` placeholder lands
   * at the caret immediately, then each staged file swaps its placeholder for
   * the file-URI markdown in place — or removes it when the handler refused the
   * file (it toasts the reason). Staging resolves within a tick, so the
   * placeholder is rarely seen; it keeps the async insert anchored where the
   * caret was. Every media kind shares the image syntax, so one flow covers
   * them all. The insert-after-success invariant holds: a placeholder never
   * contains a URI, and a refused file leaves no markdown behind.
   */
  const uploadAndInsertInMarkdownMode = async (files: File[]) => {
    if (!inlineMedia || files.length === 0) return;

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
      // Checked before staging anything, so blocking here leaves nothing behind
      toast({ variant: 'error', description: 'Not enough space left in the article for the file.' });
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

    // The whole pick is staged in one tick, so the session's batch budget sees
    // all of it; the swaps then run in order, each on the freshest textarea
    // content. A refused file was already toasted by the handler.
    const staged = await Promise.allSettled(files.map((file) => inlineMedia.upload(file)));
    staged.forEach((result, index) => {
      replaceMarkdownPlaceholder(placeholders[index], result.status === 'fulfilled' ? `![](${result.value})` : '');
    });
  };

  const handleMarkdownMediaInputChange = (event: React.ChangeEvent<HTMLInputElement>, kind: InlineMediaKind) => {
    const chosen = Array.from(event.target.files ?? []);
    // Allow re-selecting the same file later
    event.target.value = '';
    // The accept attribute only suggests; a picker set to "All files" hands over anything, and each
    // button inserts its own kind, as the rich-text dialog does
    const files = chosen.filter((file) => getInlineMediaKindFromMime(file.type) === kind);
    if (files.length < chosen.length) {
      toast({ variant: 'error', description: INLINE_MEDIA_KIND_UI[kind].wrongFile });
    }
    void uploadAndInsertInMarkdownMode(files);
  };

  const handleMarkdownTextareaPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!inlineMedia || readOnly) return;

    // File-first, like GitHub: real clipboards bundle image files with
    // text/html flavors (screenshots, images copied from apps), so any media
    // file wins over the accompanying text. Text-only payloads paste normally.
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null && ARTICLE_INLINE_SUPPORTED_MIME_TYPES.includes(file.type));
    if (files.length === 0) return;

    // preventDefault stops the textarea's own paste of the clipboard text; nothing above the
    // editor handles paste
    event.preventDefault();
    void uploadAndInsertInMarkdownMode(files);
  };

  const handleMarkdownTextareaDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    if (!inlineMedia || readOnly) return;

    // Supported media types only (not image/* — e.g. HEIC would flash a
    // placeholder the upload then rejects); anything else bubbles to the
    // composer container, whose handler shows the unsupported-type toast
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      ARTICLE_INLINE_SUPPORTED_MIME_TYPES.includes(file.type),
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
        {/* Same gap and padding as the rich-text toolbar, so the mode toggle keeps the buttons in step */}
        <Container
          overrideDefaults
          className="flex min-h-10.75 cursor-auto flex-wrap items-center gap-0.5 rounded-md border bg-background px-1 py-1.5"
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

          {/* One insert button per media kind, each with its own hidden picker */}
          {inlineMedia &&
            INLINE_MEDIA_KINDS.map((kind) => {
              const { label, Icon } = INLINE_MEDIA_KIND_UI[kind];
              return (
                <Fragment key={kind}>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={label}
                    onClick={() => markdownMediaInputRefs.current[kind]?.click()}
                    disabled={readOnly}
                    className="size-7 cursor-default rounded disabled:pointer-events-auto disabled:opacity-100"
                    data-testid={`markdown-${kind}-button`}
                  >
                    <Icon className="size-6" />
                  </Button>
                  <Input
                    ref={(element) => {
                      markdownMediaInputRefs.current[kind] = element;
                    }}
                    type="file"
                    accept={ARTICLE_INLINE_ACCEPT_STRING_BY_KIND[kind]}
                    multiple
                    className="hidden"
                    onChange={(event) => handleMarkdownMediaInputChange(event, kind)}
                    data-testid={`markdown-${kind}-input`}
                  />
                </Fragment>
              );
            })}

          <Button
            variant="ghost"
            size="icon"
            title={'Rich Text'}
            onClick={switchToRichTextMode}
            disabled={readOnly}
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

      {/* Rich text mode: MDXEditor (includes its own toolbar) — hidden via CSS in markdown mode. The
          wrapper carries the toggle, not MDXEditor's own className: MDXEditor rebuilds its popup
          container (the tooltips' portal target) whenever that prop changes, and a toolbar button
          that did not re-render since would keep portaling into the detached one. */}
      <Container overrideDefaults className={cn(mode === 'markdown' && 'hidden')}>
        <MDXEditor
          readOnly={readOnly}
          overlayContainer={overlayContainer}
          placeholder={'Start writing your masterpiece'}
          className="dark-theme cursor-auto"
          // leading-6, font-medium and text-secondary-foreground mirror PostText's
          // article body text so the editor previews the published spacing (WYSIWYG).
          contentEditableClassName="prose prose-neutral prose-invert prose-code:before:content-none prose-code:after:content-none max-w-none leading-6 font-medium text-secondary-foreground px-0! pb-0! pt-4! max-h-[60dvh] overflow-y-auto"
          plugins={[
            toolbarPlugin({
              // Tight gap and padding: the whole row has to fit the feed composer's width (globals.css
              // trims MDXEditor's own margins for the same reason)
              toolbarClassName: 'bg-background! border rounded-md! flex-wrap gap-0.5! px-1!',
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <BlockTypeSelect />
                  <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
                  <StrikeThroughSupSubToggles options={['Strikethrough']} />
                  <ListsToggle options={['bullet', 'number']} />
                  <InsertThematicBreak />
                  <CreateLink />
                  {inlineMedia && (
                    <>
                      <InsertImage />
                      <InsertInlineMediaButton mediaKind="video" />
                      <InsertInlineMediaButton mediaKind="audio" />
                      <InsertInlineMediaButton mediaKind="pdf" />
                    </>
                  )}
                  <CodeToggle />
                  <InsertCodeBlock />
                  <ButtonWithTooltip title={'Emoji'} onClick={() => setShowEmojiPicker(true)}>
                    <Smile className="size-6" />
                  </ButtonWithTooltip>
                  <ButtonWithTooltip title={'Markdown'} onClick={switchToMarkdownMode}>
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
            ...(inlineMedia
              ? [
                  imagePlugin({
                    imageUploadHandler: inlineMedia.upload,
                    imagePreviewHandler: async (imageSource) => resolvePreview(imageSource),
                    // CRITICAL: resized images serialize as raw HTML <img> mdast
                    // nodes, escaping the AST-based attachment rewrite on publish.
                    disableImageResize: true,
                    // App-styled responsive dialog with an upload loading state,
                    // shared with the video/audio/PDF insert flows
                    ImageDialog: MarkdownEditorMediaDialog,
                  }),
                  // Video, audio and PDF nodes: claims the image-syntax nodes whose
                  // file type the composer knows is not an image (see the plugin)
                  inlineMediaPlugin({
                    getMediaType: inlineMedia.getMediaType,
                    getMediaName: inlineMedia.getMediaName,
                    getPreviewUrl: resolvePreview,
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
      </Container>

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
