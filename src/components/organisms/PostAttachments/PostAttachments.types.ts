import type { PostDetailsModel } from '@/core';

export type PostAttachmentsProps = {
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
};

export type AttachmentConstructed = {
  type: string;
  name: string;
  urls: {
    main: string;
    feed?: string;
  };
};
