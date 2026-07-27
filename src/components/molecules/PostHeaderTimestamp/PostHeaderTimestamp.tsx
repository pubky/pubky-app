'use client';

import { Clock } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { RelativeTimestamp } from '@/molecules/RelativeTimestamp/RelativeTimestamp';

interface PostHeaderTimestampProps {
  timeAgo: string;
  /** When provided, shows exact date/time in a tooltip on hover (desktop only) */
  indexedAt?: Date | null;
}

export function PostHeaderTimestamp({ timeAgo, indexedAt }: PostHeaderTimestampProps) {
  const isMobile = useIsMobile();

  return (
    <Container className="flex flex-shrink-0 items-center gap-1" overrideDefaults>
      <RelativeTimestamp
        timeAgo={timeAgo}
        date={indexedAt}
        isMobile={isMobile}
        className="text-xs leading-4 font-medium tracking-widest whitespace-nowrap text-muted-foreground"
        overrideDefaults
        leading={<Clock className="size-4 text-muted-foreground" />}
        triggerClassName="flex flex-shrink-0 items-center gap-1"
      />
    </Container>
  );
}
