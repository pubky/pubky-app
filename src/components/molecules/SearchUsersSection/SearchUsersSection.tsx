import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { SearchUserSuggestion } from '../SearchUserSuggestion/SearchUserSuggestion';
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
    <Container overrideDefaults className="flex flex-col gap-2">
      <Typography size="xs" className="tracking-widest text-muted-foreground uppercase">
        {title}
      </Typography>
      <Container data-cy="search-users-section" overrideDefaults className="flex flex-wrap gap-x-6 gap-y-3">
        {users.map((user) => (
          <SearchUserSuggestion key={user.id} user={user} onClick={onUserClick} />
        ))}
      </Container>
    </Container>
  );
}
