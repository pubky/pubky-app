import { FileController } from '@/controllers/file/file';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { AttachmentConstructed, CategorizedAttachments } from './PostAttachments.types';

type FileMetadata = Awaited<ReturnType<typeof FileController.getMetadata>>[number];

/** Split already-constructed attachments into media-type buckets. */
export function categorizeAttachments(attachments: AttachmentConstructed[]): CategorizedAttachments {
  const imagesAndVideos: AttachmentConstructed[] = [];
  const audios: AttachmentConstructed[] = [];
  const genericFiles: AttachmentConstructed[] = [];

  for (const attachment of attachments) {
    if (attachment.type.startsWith('image') || attachment.type.startsWith('video')) {
      imagesAndVideos.push(attachment);
    } else if (attachment.type.startsWith('audio')) {
      audios.push(attachment);
    } else {
      genericFiles.push(attachment);
    }
  }

  return { imagesAndVideos, audios, genericFiles };
}

/** Build categorized AttachmentConstructed lists from remote file metadata. */
export function splitAttachmentsByMediaType(metadata: FileMetadata[]): CategorizedAttachments {
  return categorizeAttachments(
    metadata.map(({ content_type, name, id }) => ({
      type: content_type,
      name,
      urls: {
        main: FileController.getFileUrl({ fileId: id, variant: FileVariant.MAIN }),
        feed: content_type.startsWith('image')
          ? FileController.getFileUrl({ fileId: id, variant: FileVariant.FEED })
          : undefined,
      },
    })),
  );
}
