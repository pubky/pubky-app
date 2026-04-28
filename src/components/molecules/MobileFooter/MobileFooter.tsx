'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useKeyboardOffset } from '@/hooks/useKeyboardOffset/useKeyboardOffset';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as App from '@/app';
import * as Core from '@/core';
import { useTranslations } from 'next-intl';
import { Home, Search, Flame, Bookmark, Settings } from 'lucide-react';
import { cn } from '@/libs/utils/utils';

export interface MobileFooterProps {
  className?: string;
}
const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

/**
 * MobileFooter - Bottom navigation for mobile devices
 *
 * Hidden for unauthenticated users on public routes (single post, profile)
 * following pubky-app pattern.
 */
export function MobileFooter({ className }: MobileFooterProps) {
  const pathname = usePathname();
  const tCommon = useTranslations('common');
  const isAuthenticated = Core.useAuthStore((state) => Boolean(state.currentUserPubky));
  const { isPublicRoute } = usePublicRoute();
  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const unreadNotifications = Core.useNotificationStore((state) => state.selectUnread());
  const localAvatarUrl = Core.useLocalFilesStore((state) => state.profile);
  const { isKeyboardVisible, keyboardOffset } = useKeyboardOffset();
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

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
    {
      href: App.APP_ROUTES.HOME,
      icon: Home,
      label: 'Home',
    },
    {
      href: App.APP_ROUTES.SEARCH,
      icon: Search,
      label: 'Search',
    },
    {
      href: App.APP_ROUTES.HOT,
      icon: Flame,
      label: 'Hot',
    },
    {
      href: App.APP_ROUTES.BOOKMARKS,
      icon: Bookmark,
      label: 'Bookmarks',
    },
    {
      href: App.SETTINGS_ROUTES.ACCOUNT,
      activePrefix: App.APP_ROUTES.SETTINGS,
      icon: Settings,
      label: 'Settings',
    },
  ];
  return (
    <Atoms.Container
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
      <Atoms.Container
        overrideDefaults
        className="mx-auto flex max-w-[380px] items-center justify-between sm:max-w-[600px] md:max-w-[720px]"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const activePath = item.activePrefix ?? item.href;
          const isHome = item.href === App.APP_ROUTES.HOME;
          const isHomeActive = isHome && isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              onClick={(event) => {
                // Don't hijack modified clicks (new tab/window, etc.)
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                if (!isHome) return;
                if (isHomeActive) {
                  event.preventDefault();
                  window.scrollTo({
                    top: 0,
                    behavior: 'smooth',
                  });
                  return;
                }

                // Home feed is kept mounted to preserve scroll; mark explicit intent to reset to top on enter.
                try {
                  window.sessionStorage.setItem(FORCE_HOME_SCROLL_TOP_KEY, '1');
                } catch {
                  // Ignore storage errors and keep default navigation behavior.
                }
              }}
              className={cn(
                'rounded-full p-3 transition-all',
                isActive(activePath)
                  ? 'bg-secondary'
                  : 'border border-border bg-white/5 backdrop-blur-sm hover:bg-white/10',
              )}
            >
              <Icon className="h-6 w-6" />
            </Link>
          );
        })}
        <Link
          data-cy="footer-nav-profile-btn"
          href={App.APP_ROUTES.PROFILE}
          aria-label={tCommon('profile')}
          className="relative shrink-0 rounded-full"
        >
          <Organisms.AvatarWithFallback
            avatarUrl={avatarUrl}
            name={avatarName}
            fallbackSeed={currentUserPubky || avatarName}
            size="lg"
            className="cursor-pointer"
            alt={tCommon('profile')}
          />
          {unreadNotifications > 0 && (
            <Atoms.Badge
              data-testid="mobile-notification-counter"
              data-cy="mobile-notification-counter"
              className="absolute right-0 bottom-0 h-5 w-5 rounded-full bg-brand shadow-sm"
              variant="secondary"
            >
              <Atoms.Typography
                className={cn('font-semibold text-primary-foreground', unreadNotifications > 21 && 'text-xs')}
                size="xs"
              >
                {unreadNotifications > 21 ? '21+' : unreadNotifications}
              </Atoms.Typography>
            </Atoms.Badge>
          )}
        </Link>
      </Atoms.Container>
    </Atoms.Container>
  );
}
