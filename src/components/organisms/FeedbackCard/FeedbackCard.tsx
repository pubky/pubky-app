'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';

export function FeedbackCard() {
  const t = useTranslations('feedback');
  const { userDetails, currentUserPubky } = Hooks.useCurrentUserProfile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const name = userDetails?.name || t('defaultName');
  const avatarUrl = Hooks.useAvatarUrl(userDetails);

  return (
    <>
      <Atoms.Container
        overrideDefaults={true}
        data-testid="feedback-card"
        className="flex w-full max-w-(--filter-bar-width) flex-col gap-2"
      >
        <Atoms.Heading level={2} size="lg" className="font-light text-muted-foreground">
          {t('cardTitle')}
        </Atoms.Heading>

        <Atoms.Container
          overrideDefaults={true}
          className="flex w-full min-w-0 cursor-pointer flex-col gap-4 rounded-lg border border-dashed border-input p-6"
          onClick={() => setIsDialogOpen(true)}
        >
          <Atoms.Container overrideDefaults={true} className="flex w-full min-w-0 items-center gap-2">
            <Atoms.Container
              overrideDefaults={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-md p-2 shadow-xs"
            >
              <Organisms.AvatarWithFallback
                avatarUrl={avatarUrl}
                name={name}
                fallbackSeed={currentUserPubky || name}
                className="h-12 w-12"
                fallbackClassName="text-sm"
              />
            </Atoms.Container>
            <Atoms.Container
              overrideDefaults={true}
              className="min-w-0 flex-1 truncate text-base font-bold text-foreground"
            >
              {name}
            </Atoms.Container>
          </Atoms.Container>

          <Atoms.Button
            overrideDefaults
            className="w-full cursor-pointer text-left text-base leading-normal font-medium break-words text-muted-foreground"
          >
            {t('cardButton')}
          </Atoms.Button>
        </Atoms.Container>
      </Atoms.Container>

      <Organisms.DialogFeedback open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
