'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame, Home, Library, Search, Settings, UserRoundPlus } from 'lucide-react';
import { APP_ROUTES, isNavItemActive, SETTINGS_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { FileController } from '@/controllers/file/file';
import { useCollectionsNavDiscovery } from '@/hooks/useCollectionsNavDiscovery/useCollectionsNavDiscovery';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useKeyboardOffset } from '@/hooks/useKeyboardOffset/useKeyboardOffset';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { useNotificationStore } from '@/stores/notification/notification.store';

export interface MobileFooterProps {
  className?: string;
}

/**
 * MobileFooter - Bottom navigation for mobile devices
 *
 * Hidden for unauthenticated users on public routes (single post, profile)
 * following pubky-app pattern.
 */
export function MobileFooter({ className }: MobileFooterProps) {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => Boolean(state.currentUserPubky));
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const { isPublicExploreRoute } = usePublicRoute();
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const unreadNotifications = useNotificationStore((state) => state.selectUnread());
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);
  const { isKeyboardVisible, keyboardOffset } = useKeyboardOffset();
  const { showCollectionsNew, markCollectionsNavSeen } = useCollectionsNavDiscovery();
  const collectionsNewLabel = 'New';

  // Get avatar URL and fallback initial - same logic as desktop header
  const avatarUrl =
    localAvatarUrl ??
    (currentUserPubky && userDetails?.image
      ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
      : undefined);
  const avatarName = userDetails?.name || 'U';
  const authenticatedNavItems = [
    {
      href: APP_ROUTES.HOME,
      icon: Home,
      label: 'Home',
      isFeedRoute: true,
    },
    {
      href: APP_ROUTES.SEARCH,
      icon: Search,
      label: 'Search',
      isFeedRoute: true,
    },
    {
      href: APP_ROUTES.HOT,
      icon: Flame,
      label: 'Hot',
    },
    {
      href: APP_ROUTES.COLLECTIONS,
      activePrefix: APP_ROUTES.COLLECTIONS,
      icon: Library,
      label: 'Collections',
    },
    {
      href: SETTINGS_ROUTES.ACCOUNT,
      activePrefix: APP_ROUTES.SETTINGS,
      icon: Settings,
      label: 'Settings',
    },
  ];
  const protectedNavHrefs = new Set<string>([SETTINGS_ROUTES.ACCOUNT]);
  // Hide footer for guests only on non-explore routes. Core explore and dynamic public
  // routes (/home, /post/..., /profile/...) use the public explore footer.
  if (!isAuthenticated && !isPublicExploreRoute) {
    return null;
  }

  return (
    <Container
      overrideDefaults
      className={cn(
        'fixed bottom-0 z-40 w-full overflow-x-auto bg-gradient-to-t from-background via-background/95 to-transparent px-3 py-4 transition-transform duration-75 lg:hidden',
        className,
      )}
      style={
        isKeyboardVisible && keyboardOffset > 0
          ? {
              transform: `translateY(-${keyboardOffset}px)`,
            }
          : undefined
      }
    >
      <Container
        overrideDefaults
        className="mx-auto flex max-w-[380px] items-center justify-between sm:max-w-[600px] md:max-w-[720px]"
      >
        {authenticatedNavItems.map((item) => {
          const Icon = item.icon;
          const itemIsActive = isNavItemActive(pathname, item);
          const isCollectionsItem = item.href === APP_ROUTES.COLLECTIONS;
          const showCollectionsNewTreatment = isCollectionsItem && showCollectionsNew;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={showCollectionsNewTreatment ? `${item.label}, ${collectionsNewLabel}` : item.label}
              onClick={(event) => {
                if (!isAuthenticated && protectedNavHrefs.has(item.href)) {
                  event.preventDefault();
                  setShowSignInDialog(true);
                  return;
                }
                if (isAuthenticated && isCollectionsItem) {
                  markCollectionsNavSeen();
                }
                if (!item.isFeedRoute) return;
                handleFeedNavClick(event, { isActive: itemIsActive, smoothScrollWhenActive: true });
              }}
              className={cn(
                'rounded-full p-3 transition-all',
                showCollectionsNewTreatment
                  ? 'relative inline-flex border border-brand bg-white/5 text-brand hover:bg-brand/10'
                  : itemIsActive
                    ? 'bg-secondary'
                    : 'border border-border bg-white/5 backdrop-blur-sm hover:bg-white/10',
              )}
            >
              <Icon className="h-6 w-6" />
              {showCollectionsNewTreatment ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 text-xs font-semibold text-brand uppercase"
                >
                  {collectionsNewLabel}
                </span>
              ) : null}
            </Link>
          );
        })}
        {isAuthenticated ? (
          <Link
            data-cy="footer-nav-profile-btn"
            href={APP_ROUTES.PROFILE}
            aria-label={'Profile'}
            className="relative shrink-0 rounded-full"
          >
            <AvatarWithFallback
              avatarUrl={avatarUrl}
              name={avatarName}
              fallbackSeed={currentUserPubky || avatarName}
              size="lg"
              className="cursor-pointer"
              alt={'Profile'}
            />
            {unreadNotifications > 0 && (
              <Badge
                data-testid="mobile-notification-counter"
                data-cy="mobile-notification-counter"
                className="absolute right-0 bottom-0 h-5 w-5 rounded-full bg-brand shadow-sm"
                variant="secondary"
              >
                <Typography
                  className={cn('font-semibold text-primary-foreground', unreadNotifications > 21 && 'text-xs')}
                  size="xs"
                >
                  {unreadNotifications > 21 ? '21+' : unreadNotifications}
                </Typography>
              </Badge>
            )}
          </Link>
        ) : (
          <Button
            variant="secondary"
            size="icon"
            className="size-12 items-center justify-center border bg-white/5"
            aria-label="Join Pubky"
            onClick={() => setShowSignInDialog(true)}
          >
            <UserRoundPlus className="size-6" />
          </Button>
        )}
      </Container>
    </Container>
  );
}
