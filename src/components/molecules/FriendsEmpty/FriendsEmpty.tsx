'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { UserRoundPlus } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';

export function FriendsEmpty() {
  const router = useRouter();
  const { requireAuth } = useRequireAuth();

  const handleWhoToFollowClick = () => {
    requireAuth(() => router.push(APP_ROUTES.WHO_TO_FOLLOW));
  };

  const handlePopularUsersClick = () => {
    router.push(APP_ROUTES.HOT);
  };

  return (
    <Container data-cy="profile-friends-empty" className="relative items-center gap-6 px-0 py-6">
      {/* Background image */}
      <Image
        src="/images/connections-empty-state.webp"
        alt={'Friends - Empty state'}
        fill
        className="pointer-events-none object-contain object-center"
        aria-hidden="true"
      />

      {/* Icon */}
      <Container overrideDefaults={true} className="flex items-center rounded-full bg-brand/16 p-6">
        <UserRoundPlus className="size-12 text-brand" strokeWidth={1.5} />
      </Container>

      {/* Title and subtitle */}
      <Container className="items-center gap-6">
        <Typography as="h3" size="lg">
          {'No friends yet'}
        </Typography>

        <Typography className="text-center text-base leading-6 font-medium text-secondary-foreground">
          {"Follow someone, and if they follow you back, you'll become friends!\nStart following Pubky users, you never know who might follow you back!"
            .split('\n')
            .map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
        </Typography>
      </Container>

      {/* Action Buttons */}
      <Container className="items-center justify-center gap-3 lg:flex-row">
        <Button
          type="button"
          variant="secondary"
          size="default"
          className="gap-2"
          data-cy="profile-friends-empty-who-to-follow"
          onClick={handleWhoToFollowClick}
        >
          <UserRoundPlus className="size-4" />
          <Typography as="span" overrideDefaults={true}>
            {'Who to Follow'}
          </Typography>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="default"
          className="gap-2"
          data-cy="profile-friends-empty-popular-users"
          onClick={handlePopularUsersClick}
        >
          <UserRoundPlus className="size-4" />
          <Typography as="span" overrideDefaults={true}>
            {'Popular Users'}
          </Typography>
        </Button>
      </Container>
    </Container>
  );
}
