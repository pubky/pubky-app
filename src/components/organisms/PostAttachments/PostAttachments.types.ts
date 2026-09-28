import type { PostDetailsModel } from '@/models/post/details/postDetails';

export type PostAttachmentsProps = {
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  mediaVariant?: 'default' | 'list';
};

export type AttachmentConstructed = {
  type: string;
  name: string;
  urls: {
    main: string;
    feed?: string;
  };
  /** Unlocked content only: position in the locked post's `attachments`. A lost file leaves a gap. */
  slot?: number;
};

export type CategorizedAttachments = {
  imagesAndVideos: AttachmentConstructed[];
  audios: AttachmentConstructed[];
  genericFiles: AttachmentConstructed[];
};
