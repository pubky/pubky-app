'use client';

import { Container } from '@/atoms/Container/Container';
import { useLayoutReset } from '@/hooks/useLayoutReset/useLayoutReset';
import { UserNotFound } from '@/molecules/UserNotFound/UserNotFound';
import { HotActiveUsers } from '@/organisms/HotActiveUsers/HotActiveUsers';
import { HotDiscoveryContentLayout } from '@/organisms/HotDiscoveryContentLayout/HotDiscoveryContentLayout';

/**
 * Full-window “user not found” experience: {@link HotDiscoveryContentLayout} matches {@link Hot},
 * with {@link HotActiveUsers} under the empty state.
 */
export function ProfileUserNotFoundDiscoveryView() {
  useLayoutReset();

  return (
    <HotDiscoveryContentLayout>
      <Container overrideDefaults className="flex flex-col gap-12">
        <UserNotFound />
        <HotActiveUsers />
      </Container>
    </HotDiscoveryContentLayout>
  );
}
