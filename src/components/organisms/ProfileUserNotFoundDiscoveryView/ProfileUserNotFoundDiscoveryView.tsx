'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
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
  const t = useTranslations('profile.notFound');
  const router = useRouter();

  return (
    <HotDiscoveryContentLayout>
      <Container overrideDefaults className="flex flex-col gap-12">
        <UserNotFound
          title={t('title')}
          subtitle={t('subtitle')}
          imageAlt={t('imageAlt')}
          backToFeedLabel={t('backToFeed')}
          exploreTagsLabel={t('exploreTags')}
          onBackToFeed={() => router.push(APP_ROUTES.HOME)}
          onExploreTags={() => router.push(APP_ROUTES.HOT)}
        />
        <HotActiveUsers />
      </Container>
    </HotDiscoveryContentLayout>
  );
}
