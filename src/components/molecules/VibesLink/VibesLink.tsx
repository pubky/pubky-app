'use client';

import type { ComponentProps } from 'react';
import { Link } from '@/atoms/Link/Link';
import { PUBKY_VIBES_URL } from '@/config/externalLinks';
import { vibesReminder } from '@/libs/vibes/vibesReminder';
import { useAuthStore } from '@/stores/auth/auth.store';

type VibesLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'target' | 'rel' | 'overrideDefaults'>;

export function VibesLink({ onClick, onAuxClick, ...props }: VibesLinkProps) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  return (
    <Link
      {...props}
      href={PUBKY_VIBES_URL}
      overrideDefaults
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && currentUserPubky) vibesReminder.markDone(currentUserPubky);
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        if (event.button === 1 && !event.defaultPrevented && currentUserPubky) vibesReminder.markDone(currentUserPubky);
      }}
    />
  );
}
