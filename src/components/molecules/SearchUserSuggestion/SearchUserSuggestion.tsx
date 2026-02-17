import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import type { SearchUserSuggestionProps } from './SearchUserSuggestion.types';

export function SearchUserSuggestion({ user, onClick }: SearchUserSuggestionProps) {
  const handleClick = () => {
    onClick?.(user.id);
  };

  const formattedPubky = Libs.formatPublicKey({ key: user.id });

  return (
    <Atoms.Container
      overrideDefaults
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary"
      onClick={handleClick}
      data-cy={`search-user-suggestion-${user.id}`}
      data-testid={`search-user-suggestion-${user.id}`}
      aria-label={`User ${user.name} (${formattedPubky})`}
    >
      <Organisms.AvatarWithFallback
        avatarUrl={user.avatarUrl}
        name={user.name}
        fallbackSeed={user.id}
        size="default"
        className="shrink-0"
      />
      <Atoms.Container overrideDefaults className="min-w-0 flex-1 flex-col items-start">
        <Atoms.Typography
          className="block max-w-full truncate text-sm font-bold text-foreground"
          overrideDefaults
          data-testid="user-name"
        >
          {user.name}
        </Atoms.Typography>
        <Atoms.Typography
          as="span"
          className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground uppercase"
          overrideDefaults
          data-testid="user-pubky"
        >
          {formattedPubky}
        </Atoms.Typography>
      </Atoms.Container>
    </Atoms.Container>
  );
}
