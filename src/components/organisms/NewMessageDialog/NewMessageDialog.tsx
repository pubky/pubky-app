'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { getMessagesRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { SearchController } from '@/controllers/search/search';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import { Logger } from '@/libs/logger/logger';
import { formatPublicKey, isPubkyIdentifier, stripPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useAuthStore } from '@/stores/auth/auth.store';

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 10;

export interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick someone to message: search by name or pubky, or paste a full pubky. */
export function NewMessageDialog({ open, onOpenChange }: NewMessageDialogProps) {
  const router = useRouter();
  const owner = useAuthStore((state) => state.currentUserPubky);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ query: string; ids: Pubky[] }>({ query: '', ids: [] });
  const term = query.trim();
  const pasted = stripPubkyPrefix(term);
  const isFullPubky = isPubkyIdentifier(pasted);

  useEffect(() => {
    if (!open || term.length < 2 || isFullPubky) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const [byName, byId] = await Promise.all([
          SearchController.getUsersByName({ prefix: term, limit: SEARCH_LIMIT }).catch(() => []),
          SearchController.fetchUsersById({ prefix: stripPubkyPrefix(term), limit: SEARCH_LIMIT }).catch(() => []),
        ]);
        if (active) setResult({ query: term, ids: [...new Set([...byName, ...byId])].filter((id) => id !== owner) });
      } catch (error) {
        Logger.warn('[messages] user search failed', { error });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, term, isFullPubky, owner]);

  const ids = isFullPubky ? (pasted === owner ? [] : [pasted]) : result.query === term ? result.ids : [];
  const { users } = useUserDetailsFromIds({ userIds: ids });
  const isSearching = !isFullPubky && term.length >= 2 && result.query !== term;

  const start = (peer: Pubky) => {
    onOpenChange(false);
    setQuery('');
    router.push(getMessagesRoute(peer));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{'New message'}</DialogTitle>
          <DialogDescription>{'Search by name or paste a pubky.'}</DialogDescription>
        </DialogHeader>
        <Container overrideDefaults className="flex items-center gap-2 rounded-full border border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            data-testid="new-message-search"
            aria-label="Search people"
            placeholder="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </Container>
        <Container overrideDefaults className="flex max-h-80 min-h-24 flex-col overflow-y-auto">
          {isSearching && (
            <Container overrideDefaults className="flex justify-center py-6">
              <Spinner />
            </Container>
          )}
          {!isSearching && ids.length === 0 && term.length >= 2 && (
            <Typography size="sm" className="py-6 text-center text-muted-foreground">
              {'No people found'}
            </Typography>
          )}
          {ids.map((id) => {
            const user = users.find((candidate) => candidate.id === id);
            const name = user?.name ?? formatPublicKey({ key: id, length: 10 });
            return (
              <button
                key={id}
                type="button"
                data-testid="new-message-result"
                onClick={() => start(id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-secondary"
              >
                <AvatarWithFallback avatarUrl={user?.avatarUrl} name={name} fallbackSeed={id} size="default" />
                <Container overrideDefaults className="flex min-w-0 flex-col">
                  <Typography as="span" className="truncate font-semibold">
                    {name}
                  </Typography>
                  <Typography as="span" size="xs" className="truncate text-muted-foreground">
                    {formatPublicKey({ key: id, length: 12 })}
                  </Typography>
                </Container>
              </button>
            );
          })}
        </Container>
      </DialogContent>
    </Dialog>
  );
}
