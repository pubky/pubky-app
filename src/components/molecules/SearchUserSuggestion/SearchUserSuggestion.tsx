import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { formatPublicKey } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import type { SearchUserSuggestionProps } from './SearchUserSuggestion.types';

export function SearchUserSuggestion({ user, onClick }: SearchUserSuggestionProps) {
  const handleClick = () => {
    onClick?.(user.id);
  };

  const formattedPubky = formatPublicKey({ key: user.id });

  return (
    <Container
      overrideDefaults
      // 32px avatar, no card padding/background hover (#1840): hover matches the right sidebar.
      className="flex min-w-0 cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
      onClick={handleClick}
      data-cy={`search-user-suggestion-${user.id}`}
      data-testid={`search-user-suggestion-${user.id}`}
      aria-label={`User ${user.name} (${formattedPubky})`}
    >
      <AvatarWithFallback
        avatarUrl={user.avatarUrl}
        name={user.name}
        fallbackSeed={user.id}
        size="md"
        className="shrink-0"
      />
      <Container overrideDefaults className="flex min-w-0 flex-1 flex-col items-start">
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
