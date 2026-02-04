'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as App from '@/app';
import * as Core from '@/core';
import * as Hooks from '@/hooks';

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
  const isAuthenticated = Core.useAuthStore((state) => Boolean(state.currentUserPubky));
  const { isPublicRoute } = Hooks.usePublicRoute();
  const { userDetails, currentUserPubky } = Hooks.useCurrentUserProfile();
  const unreadNotifications = Core.useNotificationStore((state) => state.selectUnread());
  const localAvatarUrl = Core.useLocalFilesStore((state) => state.profile);

  const isActive = (path: string) => pathname === path;

  // Hide footer for unauthenticated users on public routes
  if (!isAuthenticated && isPublicRoute) {
    return null;
  }

  // Get avatar URL and fallback initial - same logic as desktop header
  const avatarUrl =
    localAvatarUrl ??
    (currentUserPubky && userDetails?.image
      ? Core.FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
      : undefined);
  const avatarName = userDetails?.name || 'U';

  const navItems = [
    { href: App.APP_ROUTES.HOME, icon: Libs.Home, label: 'Home' },
    { href: App.APP_ROUTES.SEARCH, icon: Libs.Search, label: 'Search' },
    { href: App.APP_ROUTES.HOT, icon: Libs.Flame, label: 'Hot' },
    { href: App.APP_ROUTES.BOOKMARKS, icon: Libs.Bookmark, label: 'Bookmarks' },
    { href: App.APP_ROUTES.SETTINGS, icon: Libs.Settings, label: 'Settings' },
  ];

  return (
    <div className={Libs.cn('flex justify-center pb-20 lg:hidden', className)}>
      <div className="fixed bottom-0 z-40 flex w-full max-w-[380px] items-center justify-between overflow-x-auto bg-gradient-to-t from-background via-background/95 to-transparent px-3 py-4 sm:max-w-[600px] md:max-w-[720px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={Libs.cn(
                'rounded-full p-3 backdrop-blur-sm transition-all',
                isActive(item.href) ? 'bg-secondary/30' : 'bg-secondary/20 hover:bg-secondary/25',
              )}
            >
              <Icon className="h-6 w-6" />
            </Link>
          );
        })}
        <Link
          data-cy="footer-nav-profile-btn"
          href={App.APP_ROUTES.PROFILE}
          aria-label="Profile"
          className="relative flex-shrink-0"
        >
          <Organisms.AvatarWithFallback
            avatarUrl={avatarUrl}
            name={avatarName}
            size="lg"
            className={Libs.cn(isActive(App.APP_ROUTES.PROFILE) && 'ring-2 ring-primary')}
            alt="Profile"
          />
          {unreadNotifications > 0 && (
            <Atoms.Badge
              data-testid="mobile-notification-counter"
              data-cy="mobile-notification-counter"
              className="absolute right-0 bottom-0 h-5 w-5 rounded-full bg-brand shadow-sm"
              variant="secondary"
            >
              <Atoms.Typography
                className={Libs.cn('font-semibold text-primary-foreground', unreadNotifications > 21 && 'text-xs')}
                size="xs"
              >
                {unreadNotifications > 21 ? '21+' : unreadNotifications}
              </Atoms.Typography>
            </Atoms.Badge>
          )}
        </Link>
      </div>
    </div>
  );
}
