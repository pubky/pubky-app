'use client';
import { Image } from '@/atoms/Image/Image';

import { useState } from 'react';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

type PostAttachmentsCarouselImageProps = {
  image: AttachmentConstructed;
  id: string;
};

export const PostAttachmentsCarouselImage = ({ image, id }: PostAttachmentsCarouselImageProps) => {
  const [isMainLoaded, setIsMainLoaded] = useState(image.type === 'image/gif');

  return (
    <>
      {/* Feed image shown as placeholder while main loads */}
      {!isMainLoaded && (
        <Image
          src={image.urls.feed as string}
          alt={image.name}
          className="max-h-[75dvh] w-full rounded-md object-contain"
        />
      )}

      {/* Main high-res image */}
      <Image
        id={isMainLoaded ? id : undefined}
        src={image.urls.main}
        alt={image.name}
        className={isMainLoaded ? 'max-h-[75dvh] w-full rounded-md object-contain' : 'size-0'}
        onLoad={() => setIsMainLoaded(true)}
      />
    </>
  );
};
