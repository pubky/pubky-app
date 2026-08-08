import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import {
  AVATAR_CLASS_BY_HEADER_SIZE,
  type PostHeaderSize,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';

interface PostHeaderSkeletonProps {
  showUserInfo?: boolean;
  visuallyHideAvatar?: boolean;
  size?: PostHeaderSize;
}

export function PostHeaderSkeleton({
  showUserInfo = true,
  visuallyHideAvatar = false,
  size = 'normal',
}: PostHeaderSkeletonProps = {}) {
  const avatar = (
    <Skeleton
      className={cn(AVATAR_CLASS_BY_HEADER_SIZE[size], 'shrink-0 rounded-full', visuallyHideAvatar && 'invisible')}
    />
  );

  if (!showUserInfo) {
    return avatar;
  }

  return (
    <Container className="flex w-full min-w-0 items-start justify-between gap-3" overrideDefaults>
      <Container className="flex min-w-0 items-center gap-3" overrideDefaults>
        {avatar}
        <Container className="flex flex-col gap-1.5" overrideDefaults>
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </Container>
      </Container>
      <Skeleton className="h-3 w-12 rounded-md" />
    </Container>
  );
}
