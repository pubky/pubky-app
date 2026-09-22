import type { MouseEvent } from 'react';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

export interface PostMediaCarouselProps {
  media: AttachmentConstructed[];
  onOpenPreview: (index: number, event?: MouseEvent) => void;
  isPreviewOpen: boolean;
}
