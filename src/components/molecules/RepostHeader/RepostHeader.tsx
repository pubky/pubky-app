'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

/**
 * RepostHeader
 *
 * Header bar displayed on top of reposts made by the current user.
 * Shows "You reposted" with a repeat icon.
 * Only shown on simple reposts (no content) by current user.
 */
export function RepostHeader() {
  const t = useTranslations('post');

  return (
    <Atoms.Container
      className="flex items-center gap-3 rounded-t-md bg-muted px-4 py-3"
      overrideDefaults
      data-testid="repost-header"
    >
      <Libs.Repeat className="size-5" aria-label="Repeat" />
      <Atoms.Typography as="span" className="text-base font-bold text-foreground" overrideDefaults>
        {t('youReposted')}
      </Atoms.Typography>
    </Atoms.Container>
  );
}
