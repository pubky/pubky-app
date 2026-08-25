'use client';

import { ChangeEvent, Dispatch, forwardRef, SetStateAction, useEffect, useMemo } from 'react';
import { FileText, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Input } from '@/atoms/Input/Input';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { ARTICLE_ATTACHMENT_ACCEPT_STRING, POST_ATTACHMENT_ACCEPT_STRING } from '@/config/posts';
import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import { cn } from '@/libs/utils/utils';

type PostInputAttachmentsProps = {
  attachments: File[];
  setAttachments: Dispatch<SetStateAction<File[]>>;
  handleFilesAdded: (files: File[]) => void;
  isSubmitting: boolean;
  isArticle?: boolean;
  handleFileClick?: () => void;
  /** Attachments already persisted on the post being edited (edit variant only), shown before new files. */
  existingAttachments?: ExistingAttachment[];
  /** Remove an existing attachment by URI (edit variant only). */
  onRemoveExisting?: (uri: string) => void;
};
type AttachmentType = 'image' | 'video' | 'audio' | 'pdf';
type AttachmentPreview = {
  key: string;
  type?: AttachmentType;
  name: string;
  /** Render URL — object URL for new files, resolved URL for existing ones (null while loading). */
  previewUrl: string | null;
  /** Existing attachment whose metadata is still resolving — rendered as a skeleton. */
  isLoading?: boolean;
  onRemove: () => void;
};
const getAttachmentType = (mimeType: string): AttachmentType | undefined => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
};
export const PostInputAttachments = forwardRef<HTMLInputElement, PostInputAttachmentsProps>(
  (
    {
      attachments,
      setAttachments,
      handleFilesAdded,
      isSubmitting,
      isArticle,
      handleFileClick,
      existingAttachments,
      onRemoveExisting,
    },
    ref,
  ) => {
    // Deliberate useMemo despite the React Compiler: createObjectURL allocates
    // a browser resource whose IDENTITY drives the revoke cleanup below, and
    // compiler memoization is an optimization, not a semantic guarantee —
    // re-running this map on an unrelated render would leak object URLs and
    // revoke ones still bound to rendered previews.
    const newFilePreviews = useMemo(
      () =>
        attachments.map((file, index) => ({
          file,
          index,
          type: getAttachmentType(file.type),
          previewUrl: URL.createObjectURL(file),
        })),
      [attachments],
    );

    // Cleanup object URLs when attachments change or component unmounts.
    // Only new-file previews are revoked here — existing attachments' URLs are
    // owned by their source (local files store or CDN).
    useEffect(() => {
      return () => {
        newFilePreviews.forEach((attachment) => {
          URL.revokeObjectURL(attachment.previewUrl);
        });
      };
    }, [newFilePreviews]);
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      handleFilesAdded(files);

      // Reset input so the same file can be selected again
      e.target.value = '';
    };
    const previews: AttachmentPreview[] = [
      ...(existingAttachments ?? []).map((attachment) => ({
        key: attachment.uri,
        type: getAttachmentType(attachment.type),
        name: attachment.name,
        previewUrl: getAttachmentPreviewUrl(attachment),
        isLoading: attachment.urls === null && !attachment.resolutionFailed,
        onRemove: () => onRemoveExisting?.(attachment.uri),
      })),
      ...newFilePreviews.map((preview) => ({
        key: preview.previewUrl,
        type: preview.type,
        name: preview.file.name,
        previewUrl: preview.previewUrl,
        onRemove: () => setAttachments((prev) => prev.filter((_, index) => index !== preview.index)),
      })),
    ];
    return (
      <>
        <Input
          ref={ref}
          type="file"
          accept={isArticle ? ARTICLE_ATTACHMENT_ACCEPT_STRING : POST_ATTACHMENT_ACCEPT_STRING}
          multiple={!isArticle}
          onChange={handleFileChange}
          className="hidden"
        />

        {isArticle && !previews.length ? (
          <Card className="h-39 w-full cursor-auto items-center justify-center rounded-md">
            <CardContent className="flex flex-col items-center justify-center gap-3">
              <Container overrideDefaults className="flex size-16 items-center justify-center rounded-full bg-brand/15">
                <ImagePlus className="size-8 text-brand" />
              </Container>

              <Button variant="secondary" size="sm" onClick={handleFileClick} disabled={isSubmitting}>
                <Plus className="size-4" /> Add image
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {previews.length ? (
          <Container className="gap-4">
            {previews.map((a) => {
              // Still-resolving existing attachments render as a skeleton; unknown
              // types and unresolvable ones render as a generic file card
              const displayKind = a.isLoading
                ? 'skeleton'
                : a.previewUrl && (a.type === 'image' || a.type === 'video' || a.type === 'audio')
                  ? a.type
                  : 'generic';
              return (
                <Container key={a.key} className="relative">
                  {displayKind !== 'skeleton' && (
                    <Button
                      variant="dark"
                      size="icon"
                      onClick={a.onRemove}
                      disabled={isSubmitting}
                      data-cy="post-input-attachment-remove"
                      aria-label="Remove attachment"
                      className={cn(
                        'absolute right-4 z-10 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100',
                        displayKind === 'image' || displayKind === 'video'
                          ? 'top-4 size-12'
                          : 'top-1/2 -translate-y-1/2',
                        displayKind === 'audio' && 'size-6',
                        displayKind === 'generic' && 'size-8',
                      )}
                    >
                      <Trash2 className={cn(displayKind === 'audio' ? 'size-3' : 'size-4')} />
                    </Button>
                  )}

                  {displayKind === 'skeleton' && <Skeleton className="h-48 w-full rounded-md" />}

                  {displayKind === 'image' && (
                    <Image
                      src={a.previewUrl!}
                      alt="Image preview"
                      className="h-48 w-full cursor-auto rounded-md bg-black object-contain"
                    />
                  )}

                  {displayKind === 'video' && <Video src={a.previewUrl!} className="h-48 w-full cursor-auto" />}

                  {displayKind === 'audio' && <Audio src={a.previewUrl!} className="w-full cursor-auto" />}

                  {displayKind === 'generic' && (
                    <Container className="cursor-auto flex-row items-center gap-x-2 rounded-md bg-muted p-4 pr-14">
                      <FileText className="size-6 shrink-0" />

                      <Typography size="sm" className="font-bold break-all">
                        {a.name}
                      </Typography>
                    </Container>
                  )}
                </Container>
              );
            })}
          </Container>
        ) : null}
      </>
    );
  },
);
PostInputAttachments.displayName = 'PostInputAttachments';
