'use client';

import { useRouter } from 'next/navigation';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

interface UserInfoPopoverHeaderProps {
  userId: string;
  userName: string;
  formattedPublicKey: string;
  avatarUrl?: string;
}

export function UserInfoPopoverHeader({ userId, userName, formattedPublicKey, avatarUrl }: UserInfoPopoverHeaderProps) {
  const router = useRouter();
  const profileUrl = `/profile/${userId}`;

  // Navigate to profile programmatically while preventing event propagation
  // This prevents clicks from bubbling up to PostMain's onClick handler
  const handleProfileNavigation = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(profileUrl);
  };

  return (
    <Container className="flex min-w-0 items-center gap-2" overrideDefaults>
      <Link href={profileUrl} onClick={handleProfileNavigation} className="shrink-0" overrideDefaults>
        <AvatarWithFallback avatarUrl={avatarUrl} name={userName} fallbackSeed={userId} size="md" />
      </Link>
      <Container className="min-w-0 flex-1 items-start overflow-hidden">
        <Link href={profileUrl} onClick={handleProfileNavigation} overrideDefaults>
          <Typography
            className="max-w-full cursor-pointer truncate text-sm leading-5 font-bold text-foreground"
            overrideDefaults
          >
            {userName}
          </Typography>
        </Link>
        <Typography
          className="text-xs leading-4 font-medium tracking-[1.2px] text-muted-foreground uppercase"
          overrideDefaults
        >
          {formattedPublicKey}
        </Typography>
      </Container>
    </Container>
  );
}
