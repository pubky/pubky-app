'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { APP_ROUTES, isLogoLandingRoute, ROOT_ROUTES } from '@/app/routes';
import { Link } from '@/atoms/Link/Link';
import { cn } from '@/libs/utils/utils';

interface LogoProps {
  width?: number;
  height?: number;
  noLink?: boolean;
}

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

export function Logo({
  width = 109,
  height = 36,
  noLink = false,
  ...props
}: LogoProps & React.HTMLAttributes<HTMLAnchorElement>) {
  const pathname = usePathname();
  const isLandingRoute = isLogoLandingRoute(pathname);
  const isHome = pathname === APP_ROUTES.HOME;
  const href = isLandingRoute ? ROOT_ROUTES : APP_ROUTES.HOME;

  return !noLink ? (
    <Link
      href={href}
      data-cy="header-logo"
      onClick={(event) => {
        props.onClick?.(event);
        if (isLandingRoute || event.defaultPrevented) return;

        // Don't hijack modified clicks (new tab/window, etc.)
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

        if (isHome) {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // Home feed is kept mounted to preserve scroll; mark explicit intent to reset to top on enter.
        try {
          window.sessionStorage.setItem(FORCE_HOME_SCROLL_TOP_KEY, '1');
        } catch {
          // Ignore storage errors and keep default navigation behavior.
        }
      }}
      className={cn(`flex items-center min-w-[${width}px] min-h-[${height}px]`, props.className)}
    >
      <LogoImage width={width} height={height} />
    </Link>
  ) : (
    <LogoImage width={width} height={height} />
  );
}

const LogoImage = ({ width, height, className }: { width: number; height: number; className?: string }) => {
  return (
    <Image
      src="/pubky-logo.svg"
      alt="Pubky"
      className={cn(`w-[${width}px] h-[${height}px] -mt-1`, className)}
      width={width}
      height={height}
    />
  );
};
