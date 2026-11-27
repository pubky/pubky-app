'use client';

import { useState } from 'react';
import { Podcast } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { getImageRetryUrl, isResourceImageUrl } from '@/libs/image/resourceImage';
import { cn } from '@/libs/utils/utils';

/**
 * An audio's square cover (an episode's image, else its show's), from the app's image route only
 * (`getResourceImageUrl`): rounded, never stretched. A route answer that fails is asked once more;
 * without a cover, or when it fails again, the type's tile with a podcast icon. Any other address is
 * never loaded. Decorative: the title next to it names the audio.
 */
export function ResourceAudioArt({ image, className }: { image?: string | null; className?: string }) {
  const url = isResourceImageUrl(image) ? image : null;
  const [retried, setRetried] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) {
    return (
      <Container
        overrideDefaults
        aria-hidden="true"
        data-testid="resource-audio-art-tile"
        className={cn('flex shrink-0 items-center justify-center rounded-md bg-foreground/5', className)}
      >
        <Podcast className="size-1/2 max-h-6 max-w-6 text-muted-foreground" />
      </Container>
    );
  }
  return (
    <Image
      src={retried === url ? getImageRetryUrl(url) : url}
      alt=""
      width={96}
      height={96}
      data-testid="resource-audio-art"
      onError={() => (retried === url ? setFailed(url) : setRetried(url))}
      className={cn('shrink-0 rounded-md object-cover object-center', className)}
    />
  );
}
