'use client';

import { Clock } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { RelativeTimestamp } from '@/molecules/RelativeTimestamp/RelativeTimestamp';

interface PostHeaderTimestampProps {
  timeAgo: string;
  /** When provided, shows exact date/time in a tooltip on hover (desktop only) */
  indexedAt?: Date | null;
}

export function PostHeaderTimestamp({ timeAgo, indexedAt }: PostHeaderTimestampProps) {
  return (
    <Container className="flex flex-shrink-0 items-center gap-1" overrideDefaults>
      <RelativeTimestamp
        timeAgo={timeAgo}
        date={indexedAt}
        as="span"
        className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground"
        overrideDefaults
        leading={<Clock className="size-4 text-muted-foreground" />}
        triggerClassName="flex flex-shrink-0 items-center gap-1"
      />
    </Container>
  );
}
