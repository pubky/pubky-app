'use client';

import Image from 'next/image';
import { Plus, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';

export function FollowersEmpty() {
  const t = useTranslations('profile.empty.followers');

  return (
    <Atoms.Container data-cy="profile-followers-empty" className="relative items-center gap-6 px-0 py-6">
      {/* Background image */}
      <Image
        src="/images/connections-empty-state.webp"
        alt={t('alt')}
        fill
        className="pointer-events-none object-contain object-center"
        aria-hidden="true"
      />

      {/* Icon */}
      <Atoms.Container overrideDefaults={true} className="flex items-center rounded-full bg-brand/16 p-6">
        <UsersRound className="size-12 text-brand" strokeWidth={1.5} />
      </Atoms.Container>

      {/* Title and subtitle */}
      <Atoms.Container className="items-center gap-6">
        <Atoms.Typography as="h3" size="lg">
          {t('title')}
        </Atoms.Typography>

        <Atoms.Typography className="text-center text-base leading-6 font-medium text-secondary-foreground">
          {t('subtitle')
            .split('\n')
            .map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
        </Atoms.Typography>
      </Atoms.Container>

      {/* CTA */}
      <Atoms.Button variant="default" size="default" className="gap-2">
        <Plus className="size-4" />
        <Atoms.Typography as="span" overrideDefaults={true}>
          {t('createPost')}
        </Atoms.Typography>
      </Atoms.Button>
    </Atoms.Container>
  );
}
