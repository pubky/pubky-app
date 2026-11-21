'use client';

import { useState } from 'react';
import { Podcast } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { cn } from '@/libs/utils/utils';
import { getHttpUrl } from '@/molecules/ResourceCard/ResourceCard.utils';

/**
 * An audio's square cover (an episode's image, else its show's): rounded, never stretched. Without
 * one, or when it fails to load, the type's tile with a podcast icon. Decorative: the title next to
 * it names the audio.
 */
export function ResourceAudioArt({ image, className }: { image?: string | null; className?: string }) {
  const url = getHttpUrl(image ?? null);
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
      src={url}
      alt=""
      width={96}
      height={96}
      data-testid="resource-audio-art"
      onError={() => setFailed(url)}
      className={cn('shrink-0 rounded-md object-cover object-center', className)}
    />
  );
}
