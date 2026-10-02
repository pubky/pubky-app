import type { ReactNode } from 'react';
import type { PostDetailsModel } from '@/models/post/details/postDetails';

export type PostAttachmentsProps = {
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  className?: string;
  /** Cards caption between visual media and audio/file attachments. */
  children?: ReactNode;
  mediaVariant?: 'default' | 'list' | 'cards';
};

export type AttachmentConstructed = {
  type: string;
  name: string;
  width?: number;
  height?: number;
  urls: {
    main: string;
    feed?: string;
    /** CDN-backed images only: a session object URL has no derived variants. */
    large?: string;
  };
  /** Unlocked content only: position in the locked post's `attachments`. A lost file leaves a gap. */
  slot?: number;
};

export type CategorizedAttachments = {
  imagesAndVideos: AttachmentConstructed[];
  audios: AttachmentConstructed[];
  genericFiles: AttachmentConstructed[];
};
