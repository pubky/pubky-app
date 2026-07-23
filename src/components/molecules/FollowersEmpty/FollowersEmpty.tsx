'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Plus, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';

export function FollowersEmpty() {
  const t = useTranslations('profile.empty.followers');
  const [newPostOpen, setNewPostOpen] = useState(false);
  const { requireAuth } = useRequireAuth();

  const handleCreatePostClick = () => {
    requireAuth(() => setNewPostOpen(true));
  };

  return (
    <>
      <Container data-cy="profile-followers-empty" className="relative items-center gap-6 px-0 py-6">
        {/* Background image */}
        <Image
          src="/images/connections-empty-state.webp"
          alt={t('alt')}
          fill
          className="pointer-events-none object-contain object-center"
          aria-hidden="true"
        />

        {/* Icon */}
        <Container overrideDefaults={true} className="flex items-center rounded-full bg-brand/16 p-6">
          <UsersRound className="size-12 text-brand" strokeWidth={1.5} />
        </Container>

        {/* Title and subtitle */}
        <Container className="items-center gap-6">
          <Typography as="h3" size="lg">
            {t('title')}
          </Typography>

          <Typography className="text-center text-base leading-6 font-medium text-secondary-foreground">
            {t('subtitle')
              .split('\n')
              .map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br />}
                </span>
              ))}
          </Typography>
        </Container>

        {/* CTA */}
        <Button
          type="button"
          variant="default"
          size="default"
          className="gap-2"
          data-cy="profile-followers-empty-create-post"
          onClick={handleCreatePostClick}
        >
          <Plus className="size-4" />
          <Typography as="span" overrideDefaults={true}>
            {t('createPost')}
          </Typography>
        </Button>
      </Container>
      <DialogNewPost open={newPostOpen} onOpenChangeAction={setNewPostOpen} />
    </>
  );
}
