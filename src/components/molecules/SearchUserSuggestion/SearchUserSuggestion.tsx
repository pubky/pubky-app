import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

import type { SearchUserSuggestionProps } from './SearchUserSuggestion.types';
import { formatPublicKey } from '@/libs/utils/utils';

export function SearchUserSuggestion({ user, onClick }: SearchUserSuggestionProps) {
  const handleClick = () => {
    onClick?.(user.id);
  };

  const formattedPubky = formatPublicKey({ key: user.id });

  return (
    <Container
      overrideDefaults
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary"
      onClick={handleClick}
      data-cy={`search-user-suggestion-${user.id}`}
      data-testid={`search-user-suggestion-${user.id}`}
      aria-label={`User ${user.name} (${formattedPubky})`}
    >
      <AvatarWithFallback
        avatarUrl={user.avatarUrl}
        name={user.name}
        fallbackSeed={user.id}
        size="default"
        className="shrink-0"
      />
      <Container overrideDefaults className="min-w-0 flex-1 flex-col items-start">
        <Typography
          className="block max-w-full truncate text-sm font-bold text-foreground"
          overrideDefaults
          data-testid="user-name"
        >
          {user.name}
        </Typography>
        <Typography
          as="span"
          className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
          overrideDefaults
          data-testid="user-pubky"
        >
          {formattedPubky}
        </Typography>
      </Container>
    </Container>
  );
}
