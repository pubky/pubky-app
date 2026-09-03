'use client';

import { useEffect, useRef, useState } from 'react';
import { closeImageDialog$, imageDialogState$, imageUploadHandler$, saveImage$ } from '@mdxeditor/editor';
import { useCellValues, usePublisher } from '@mdxeditor/gurx';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
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
import { ARTICLE_ATTACHMENT_ACCEPT_STRING } from '@/config/posts';

/**
 * Replaces MDXEditor's default image dialog (`imagePlugin({ ImageDialog })`).
 *
 * Built on the app Dialog atoms so it themes and behaves responsively like
 * every other dialog, and — unlike the default — owns the upload itself:
 * the file is uploaded (with a visible loading state and disabled controls)
 * BEFORE `saveImage$` is published, so the plugin only ever receives a
 * resolved `src`, which it processes synchronously. A failed upload keeps the
 * dialog open for retry (the upload handler surfaces the error toast).
 *
 * Needs no props: the upload handler and dialog state come from the editor's
 * realm cells, so the same static component serves every editor instance.
 */
export function MarkdownEditorImageDialog() {
  const [state, imageUploadHandler] = useCellValues(imageDialogState$, imageUploadHandler$);
  const saveImage = usePublisher(saveImage$);
  const closeImageDialog = usePublisher(closeImageDialog$);

  if (state.type === 'inactive') return null;

  // KNOWN UPSTREAM LIMITATION (MDXEditor): with an imagePreviewHandler
  // configured, their ImageEditor pins `initialImagePath` to the node's FIRST
  // src and never updates it, so re-editing an image after replacing its
  // source prefills the old URI here (saving would revert the replacement).
  // Escape hatches: cancel instead of save, or toggle markdown mode and back
  // (rebuilds the pin). A workaround reading the node's current src caused a
  // worse regression, so this stays documented until fixed upstream.
  const initialValues = state.type === 'editing' ? state.initialValues : undefined;

  return (
    <ImageDialogForm
      // Remounts per dialog instance so field state never leaks between opens
      key={state.type === 'editing' ? `editing-${state.nodeKey}` : 'new'}
      isEditing={state.type === 'editing'}
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

interface ImageDialogFormProps {
  isEditing: boolean;
  initialSrc: string;
  initialAltText: string;
  initialTitle?: string;
  upload: ((file: File) => Promise<string>) | null;
  onSave: (values: { src: string; altText: string; title?: string }) => void;
  onClose: () => void;
}

function ImageDialogForm({
  isEditing,
  initialSrc,
  initialAltText,
  initialTitle,
  upload,
  onSave,
  onClose,
}: ImageDialogFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [src, setSrc] = useState(initialSrc);
  const [altText, setAltText] = useState(initialAltText);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
  };

  const removeFile = () => {
    setFile(null);
    setPreviewUrl(null);
  };

  const title = isEditing ? 'Edit image' : 'Add image';
  const canSave = Boolean(file ?? src.trim()) && !isSaving;

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;

    // A chosen file wins over the URL field. Upload first so `saveImage`
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

    onSave({ src: src.trim(), altText, title: initialTitle });
  };

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
                <Label htmlFor="image-dialog-file">{'Upload an image from your device'}</Label>
                {/* Hidden native input + styled trigger, matching the
                    collection cover picker (DialogCollectionForm) */}
                <Container
                  overrideDefaults
                  className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-md bg-card bg-cover bg-center"
                  style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
                  data-testid="image-dialog-file-preview"
                >
                  {file ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={removeFile}
                      disabled={isSaving}
                      aria-label={'Remove image'}
                      data-testid="image-dialog-file-remove-button"
                    >
                      <Trash2 className="size-4" />
                      {'Remove image'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                      aria-label={'Choose image'}
                      data-testid="image-dialog-file-choose-button"
                    >
                      <ImageIcon className="size-4" />
                      {'Choose image'}
                    </Button>
                  )}
                </Container>
                <input
                  ref={fileInputRef}
                  id="image-dialog-file"
                  type="file"
                  accept={ARTICLE_ATTACHMENT_ACCEPT_STRING}
                  className="hidden"
                  disabled={isSaving}
                  onChange={handleFileChange}
                  data-testid="image-dialog-file-input"
                />
              </Container>
            )}

            <Container overrideDefaults className="flex flex-col gap-2">
              <Label htmlFor="image-dialog-src">
                {upload ? 'Or add an image from a URL' : 'Add an image from a URL'}
              </Label>
              <Input
                id="image-dialog-src"
                type="text"
                inputMode="url"
                placeholder={'https://…'}
                value={src}
                disabled={isSaving}
                onChange={(event) => setSrc(event.target.value)}
                data-testid="image-dialog-src-input"
              />
            </Container>

            <Container overrideDefaults className="flex flex-col gap-2">
              <Label htmlFor="image-dialog-alt">{'Alt text'}</Label>
              <Input
                id="image-dialog-alt"
                type="text"
                placeholder={'Describe the image'}
                value={altText}
                disabled={isSaving}
                onChange={(event) => setAltText(event.target.value)}
                data-testid="image-dialog-alt-input"
              />
            </Container>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSaving}
                data-testid="image-dialog-cancel-button"
              >
                {'Cancel'}
              </Button>
              <Button type="submit" disabled={!canSave} data-testid="image-dialog-save-button">
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
