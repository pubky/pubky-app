'use client';

import { useEffect, useRef, useState } from 'react';
import { closeImageDialog$, imageDialogState$, imageUploadHandler$, saveImage$ } from '@mdxeditor/editor';
import { useCellValues, usePublisher } from '@mdxeditor/gurx';
import { FileText, Image as ImageIcon, type LucideIcon, Music, Trash2, Video } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { ARTICLE_INLINE_ACCEPT_STRING_BY_KIND } from '@/config/posts';
import { getInlineMediaKindFromMime, inferMediaKindFromUrl, type InlineMediaKind } from '@/libs/file/inlineMediaKind';
import { toast } from '@/molecules/Toaster/toast';
import {
  closeInlineMediaDialog$,
  inlineMediaDialogState$,
  inlineMediaUploadHandler$,
  saveInlineMedia$,
} from './inlineMediaPlugin';

/** Static per-kind copy; the image strings are the ones the image dialog has always shown. */
const COPY: Record<
  InlineMediaKind,
  {
    add: string;
    edit: string;
    chooseLabel: string;
    choose: string;
    remove: string;
    urlWithUpload: string;
    urlOnly: string;
    alt: string;
    altPlaceholder: string;
    wrongFile: string;
    wrongUrl: string | null;
    Icon: LucideIcon;
  }
> = {
  image: {
    add: 'Add image',
    edit: 'Edit image',
    chooseLabel: 'Upload an image from your device',
    choose: 'Choose image',
    remove: 'Remove image',
    urlWithUpload: 'Or add an image from a URL',
    urlOnly: 'Add an image from a URL',
    alt: 'Alt text',
    altPlaceholder: 'Describe the image',
    wrongFile: 'Choose an image file.',
    wrongUrl: null,
    Icon: ImageIcon,
  },
  video: {
    add: 'Add video',
    edit: 'Edit video',
    chooseLabel: 'Upload a video from your device',
    choose: 'Choose video',
    remove: 'Remove video',
    urlWithUpload: 'Or add a video from a URL',
    urlOnly: 'Add a video from a URL',
    alt: 'Description',
    altPlaceholder: 'Describe the video',
    wrongFile: 'Choose a video file.',
    wrongUrl: 'Enter a direct link to a video file.',
    Icon: Video,
  },
  audio: {
    add: 'Add audio',
    edit: 'Edit audio',
    chooseLabel: 'Upload an audio file from your device',
    choose: 'Choose audio',
    remove: 'Remove audio',
    urlWithUpload: 'Or add audio from a URL',
    urlOnly: 'Add audio from a URL',
    alt: 'Description',
    altPlaceholder: 'Describe the audio',
    wrongFile: 'Choose an audio file.',
    wrongUrl: 'Enter a direct link to an audio file.',
    Icon: Music,
  },
  pdf: {
    add: 'Add PDF',
    edit: 'Edit PDF',
    chooseLabel: 'Upload a PDF from your device',
    choose: 'Choose PDF',
    remove: 'Remove PDF',
    urlWithUpload: 'Or add a PDF from a URL',
    urlOnly: 'Add a PDF from a URL',
    alt: 'Description',
    altPlaceholder: 'Describe the document',
    wrongFile: 'Choose a PDF file.',
    wrongUrl: 'Enter a direct link to a PDF file.',
    Icon: FileText,
  },
};

/**
 * The insert/edit dialog for every inline media kind, registered once as `imagePlugin`'s
 * `ImageDialog`. Images keep MDXEditor's own dialog cells (`imageDialogState$`, `saveImage$`), so
 * `InsertImage`, the image toolbar and node editing stay untouched; video, audio and PDF are
 * driven by `inlineMediaDialogState$` from the inline media plugin.
 *
 * Built on the app Dialog atoms so it themes and behaves responsively like every other dialog,
 * and — unlike MDXEditor's default — owns the upload itself: the file is uploaded (with a
 * visible loading state and disabled controls) BEFORE the save signal is published, so the
 * plugin only ever receives a resolved `src`, which it processes synchronously. A failed upload
 * keeps the dialog open for retry (the upload handler surfaces the error toast).
 *
 * Needs no props: the upload handlers and dialog states come from the editor's realm cells, so
 * the same static component serves every editor instance.
 */
export function MarkdownEditorMediaDialog() {
  const [imageState, imageUploadHandler, mediaState, mediaUploadHandler] = useCellValues(
    imageDialogState$,
    imageUploadHandler$,
    inlineMediaDialogState$,
    inlineMediaUploadHandler$,
  );
  const saveImage = usePublisher(saveImage$);
  const closeImageDialog = usePublisher(closeImageDialog$);
  const saveMedia = usePublisher(saveInlineMedia$);
  const closeMediaDialog = usePublisher(closeInlineMediaDialog$);

  if (imageState.type !== 'inactive') {
    // KNOWN UPSTREAM LIMITATION (MDXEditor): with an imagePreviewHandler
    // configured, their ImageEditor pins `initialImagePath` to the node's FIRST
    // src and never updates it, so re-editing an image after replacing its
    // source prefills the old URI here (saving would revert the replacement).
    // Escape hatches: cancel instead of save, or toggle markdown mode and back
    // (rebuilds the pin). A workaround reading the node's current src caused a
    // worse regression, so this stays documented until fixed upstream.
    const initialValues = imageState.type === 'editing' ? imageState.initialValues : undefined;

    return (
      <MediaDialogForm
        // Remounts per dialog instance so field state never leaks between opens
        key={imageState.type === 'editing' ? `editing-${imageState.nodeKey}` : 'new'}
        mediaKind="image"
        isEditing={imageState.type === 'editing'}
        initialSrc={initialValues?.src ?? ''}
        initialAltText={initialValues?.altText ?? ''}
        // Invisible passthrough: editing must not wipe a title that markdown-mode
        // users (or other clients) put on the image
        initialTitle={initialValues?.title}
        upload={imageUploadHandler}
        onSave={saveImage}
        onClose={() => closeImageDialog()}
      />
    );
  }

  if (mediaState.type !== 'inactive') {
    const { mediaKind } = mediaState;
    const initialValues = mediaState.type === 'editing' ? mediaState.initialValues : undefined;

    return (
      <MediaDialogForm
        key={mediaState.type === 'editing' ? `editing-${mediaState.nodeKey}` : `new-${mediaKind}`}
        mediaKind={mediaKind}
        isEditing={mediaState.type === 'editing'}
        initialSrc={initialValues?.src ?? ''}
        initialAltText={initialValues?.altText ?? ''}
        initialTitle={initialValues?.title}
        upload={mediaUploadHandler}
        onSave={(values) => saveMedia({ ...values, mediaKind })}
        onClose={() => closeMediaDialog()}
      />
    );
  }

  return null;
}

interface MediaDialogFormProps {
  mediaKind: InlineMediaKind;
  isEditing: boolean;
  initialSrc: string;
  initialAltText: string;
  initialTitle?: string;
  upload: ((file: File) => Promise<string>) | null;
  onSave: (values: { src: string; altText: string; title?: string }) => void;
  onClose: () => void;
}

function MediaDialogForm({
  mediaKind,
  isEditing,
  initialSrc,
  initialAltText,
  initialTitle,
  upload,
  onSave,
  onClose,
}: MediaDialogFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [src, setSrc] = useState(initialSrc);
  const [altText, setAltText] = useState(initialAltText);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copy = COPY[mediaKind];
  const isImage = mediaKind === 'image';

  // Object URLs live exactly as long as the chosen file is displayed
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    // Allow re-choosing the same file after a removal
    event.target.value = '';
    if (!chosen) return;
    // The accept attribute already filters the picker; this guards a file that slipped past it
    if (getInlineMediaKindFromMime(chosen.type) !== mediaKind) {
      toast({ variant: 'error', description: copy.wrongFile });
      return;
    }
    setFile(chosen);
    // Only an image can preview as a background; other kinds show their name
    setPreviewUrl(isImage ? URL.createObjectURL(chosen) : null);
  };

  const removeFile = () => {
    setFile(null);
    setPreviewUrl(null);
  };

  const title = isEditing ? copy.edit : copy.add;
  const canSave = Boolean(file ?? src.trim()) && !isSaving;

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;

    // A chosen file wins over the URL field. Upload first so the save signal
    // only ever receives a resolved src — the plugin handles that
    // synchronously and closes the dialog by flipping the state cell.
    if (file && upload) {
      setIsSaving(true);
      try {
        const uploadedSrc = await upload(file);
        onSave({ src: uploadedSrc, altText, title: initialTitle });
      } catch {
        // The upload handler already toasts the failure; stay open for retry
        setIsSaving(false);
      }
      return;
    }

    const trimmedSrc = src.trim();
    // An external URL must name a file of this kind: the reader types external media by its
    // extension. An uploaded file (a `pubky://` URI, as when editing) is typed by its metadata.
    if (copy.wrongUrl && !trimmedSrc.startsWith('pubky://') && inferMediaKindFromUrl(trimmedSrc) !== mediaKind) {
      toast({ variant: 'error', description: copy.wrongUrl });
      return;
    }
    onSave({ src: trimmedSrc, altText, title: initialTitle });
  };

  const testId = `${mediaKind}-dialog`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      {/* Nested inside the composer dialog like DialogConfirmDiscard to avoid
          mobile touch event issues with sibling portals */}
      <DialogContent className="w-lg" hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{`${title} dialog`}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Container overrideDefaults className="flex flex-col gap-4">
            {upload && (
              <Container overrideDefaults className="flex flex-col gap-2">
                <Label htmlFor={`${testId}-file`}>{copy.chooseLabel}</Label>
                {/* Hidden native input + styled trigger, matching the
                    collection cover picker (DialogCollectionForm) */}
                <Container
                  overrideDefaults
                  className="relative flex h-32 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-md bg-card bg-cover bg-center"
                  style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
                  data-testid={`${testId}-file-preview`}
                >
                  {file && !isImage && (
                    <span className="flex max-w-full items-center gap-x-2 px-4 text-sm text-muted-foreground">
                      <copy.Icon aria-hidden="true" className="size-5 shrink-0" />
                      <span className="min-w-0 truncate" data-testid={`${testId}-file-name`}>
                        {file.name}
                      </span>
                    </span>
                  )}
                  {file ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={removeFile}
                      disabled={isSaving}
                      aria-label={copy.remove}
                      data-testid={`${testId}-file-remove-button`}
                    >
                      <Trash2 className="size-4" />
                      {copy.remove}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                      aria-label={copy.choose}
                      data-testid={`${testId}-file-choose-button`}
                    >
                      <copy.Icon className="size-4" />
                      {copy.choose}
                    </Button>
                  )}
                </Container>
                <input
                  ref={fileInputRef}
                  id={`${testId}-file`}
                  type="file"
                  accept={ARTICLE_INLINE_ACCEPT_STRING_BY_KIND[mediaKind]}
                  className="hidden"
                  disabled={isSaving}
                  onChange={handleFileChange}
                  data-testid={`${testId}-file-input`}
                />
              </Container>
            )}

            <Container overrideDefaults className="flex flex-col gap-2">
              <Label htmlFor={`${testId}-src`}>{upload ? copy.urlWithUpload : copy.urlOnly}</Label>
              <Input
                id={`${testId}-src`}
                type="text"
                inputMode="url"
                placeholder={'https://…'}
                value={src}
                disabled={isSaving}
                onChange={(event) => setSrc(event.target.value)}
                data-testid={`${testId}-src-input`}
              />
            </Container>

            <Container overrideDefaults className="flex flex-col gap-2">
              <Label htmlFor={`${testId}-alt`}>{copy.alt}</Label>
              <Input
                id={`${testId}-alt`}
                type="text"
                placeholder={copy.altPlaceholder}
                value={altText}
                disabled={isSaving}
                onChange={(event) => setAltText(event.target.value)}
                data-testid={`${testId}-alt-input`}
              />
            </Container>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSaving}
                data-testid={`${testId}-cancel-button`}
              >
                {'Cancel'}
              </Button>
              <Button type="submit" disabled={!canSave} data-testid={`${testId}-save-button`}>
                {isSaving && <Spinner size="sm" className="mr-2" />}
                {isSaving ? 'Uploading…' : 'Save'}
              </Button>
            </DialogFooter>
          </Container>
        </form>
      </DialogContent>
    </Dialog>
  );
}
