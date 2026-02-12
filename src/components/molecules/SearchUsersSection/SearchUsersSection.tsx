import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import type { SearchUsersSectionProps } from './SearchUsersSection.types';

/**
 * SearchUsersSection
 *
 * Displays a section of users with a title.
 * Used in search suggestions to show autocomplete user results.
 */
export function SearchUsersSection({ title, users, onUserClick }: SearchUsersSectionProps) {
  if (users.length === 0) return null;

  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-2">
      <Atoms.Typography size="xs" className="tracking-widest text-muted-foreground uppercase">
        {title}
      </Atoms.Typography>
      <Atoms.Container data-cy="search-users-section" overrideDefaults className="flex flex-wrap gap-3">
        {users.map((user) => (
          <Molecules.SearchUserSuggestion key={user.id} user={user} onClick={onUserClick} />
        ))}
      </Atoms.Container>
    </Atoms.Container>
  );
}
