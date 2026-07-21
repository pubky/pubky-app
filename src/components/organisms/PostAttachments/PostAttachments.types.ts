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
};

export type CategorizedAttachments = {
  imagesAndVideos: AttachmentConstructed[];
  audios: AttachmentConstructed[];
  genericFiles: AttachmentConstructed[];
};
