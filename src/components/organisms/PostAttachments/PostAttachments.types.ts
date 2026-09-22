import type { ReactNode } from 'react';
import type { PostDetailsModel } from '@/models/post/details/postDetails';

export type PostAttachmentsProps = {
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  className?: string;
  /** Masonry caption between visual media and audio/file attachments. */
  children?: ReactNode;
  mediaVariant?: 'default' | 'list' | 'masonry';
};

export type AttachmentConstructed = {
  type: string;
  name: string;
  width?: number;
  height?: number;
  urls: {
    main: string;
    feed?: string;
  };
};

export type CategorizedAttachments = {
  imagesAndVideos: AttachmentConstructed[];
  audios: AttachmentConstructed[];
  genericFiles: AttachmentConstructed[];
};
