'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  APP_ROUTES,
  COPYRIGHT_ROUTES,
  isCustomFeedRoute,
  isLegalRoute,
  isLogoLandingRoute,
  ROOT_ROUTES,
} from '@/app/routes';
import { Link } from '@/atoms/Link/Link';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';

interface LogoProps {
  width?: number;
  height?: number;
  noLink?: boolean;
}

const DEFAULT_LOGO_WIDTH = 109;
/** Rendered logo height in px (matches `h-[36px]` / SVG aspect ratio). */
const DEFAULT_LOGO_HEIGHT = 36;

const isDefaultSize = (width: number, height: number) => width === DEFAULT_LOGO_WIDTH && height === DEFAULT_LOGO_HEIGHT;

const logoLinkClassName = (width: number, height: number, className?: string) =>
  cn('flex items-center', isDefaultSize(width, height) && 'min-h-[36px] min-w-[109px]', className);

const logoImageClassName = (width: number, height: number, className?: string) =>
  cn('-mt-1', isDefaultSize(width, height) && 'h-[36px] w-[109px]', className);

const logoSizeStyle = (width: number, height: number) =>
  isDefaultSize(width, height) ? undefined : ({ minWidth: width, minHeight: height } as const);

const logoImageStyle = (width: number, height: number) =>
  isDefaultSize(width, height) ? undefined : ({ width, height } as const);

export function Logo({
  width = DEFAULT_LOGO_WIDTH,
  height = DEFAULT_LOGO_HEIGHT,
  noLink = false,
  className,
  style,
  onClick,
  ...props
}: LogoProps & React.HTMLAttributes<HTMLAnchorElement>) {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => Boolean(selectDisplayUserPubky(state)));
  // Members open the public documents from Settings. For them `/` redirects to `/home`, which leaves `/` in
  // the history and turns Back into a loop, so their logo goes straight to `/home`.
  const isPublicDocument = pathname === COPYRIGHT_ROUTES.COPYRIGHT || isLegalRoute(pathname);
  const isLandingRoute = isLogoLandingRoute(pathname) && !(isAuthenticated && isPublicDocument);
  // A custom feed lives at `/feed/<id>` in the same persistent feed cluster as
  // `/home`. From there the logo is already on the user's feed, so it scrolls to
  // the top instead of navigating away to the default feed.
  const isFeedActive = pathname === APP_ROUTES.HOME || (pathname !== null && isCustomFeedRoute(pathname));
  const href = isLandingRoute ? ROOT_ROUTES : APP_ROUTES.HOME;

  return !noLink ? (
    <Link
      href={href}
      data-cy="header-logo"
      onClick={(event) => {
        onClick?.(event);
        if (isLandingRoute || event.defaultPrevented) return;
        handleFeedNavClick(event, { isActive: isFeedActive, smoothScrollWhenActive: true });
      }}
      className={logoLinkClassName(width, height, className)}
      style={{ ...logoSizeStyle(width, height), ...style }}
      {...props}
    >
      <LogoImage width={width} height={height} />
    </Link>
  ) : (
    <LogoImage width={width} height={height} className={className} />
  );
}

// Both wordmarks are rendered and the `.light` class on <html> picks one via
// CSS. Reading `resolvedTheme` from next-themes instead would be `undefined`
// on the server and first client paint, flashing the dark logo on light mode.
const LogoImage = ({ width, height, className }: { width: number; height: number; className?: string }) => (
  <>
    <Image
      src="/pubky-logo.svg"
      alt="Pubky"
      className={logoImageClassName(width, height, cn('[.light_&]:hidden', className))}
      style={logoImageStyle(width, height)}
      width={width}
      height={height}
    />
    <Image
      src="/pubky-logo-on-light.svg"
      alt="Pubky"
      className={logoImageClassName(width, height, cn('hidden [.light_&]:block', className))}
      style={logoImageStyle(width, height)}
      width={width}
      height={height}
    />
  </>
);
