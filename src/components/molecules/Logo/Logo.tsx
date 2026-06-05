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

const DEFAULT_LOGO_WIDTH = 109;
/** Rendered logo height in px (matches `h-[36px]` / SVG aspect ratio). */
const DEFAULT_LOGO_HEIGHT = 36;

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

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
  const isLandingRoute = isLogoLandingRoute(pathname);
  const isHome = pathname === APP_ROUTES.HOME;
  const href = isLandingRoute ? ROOT_ROUTES : APP_ROUTES.HOME;

  return !noLink ? (
    <Link
      href={href}
      data-cy="header-logo"
      onClick={(event) => {
        onClick?.(event);
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

const LogoImage = ({ width, height, className }: { width: number; height: number; className?: string }) => {
  return (
    <Image
      src="/pubky-logo.svg"
      alt="Pubky"
      className={logoImageClassName(width, height, className)}
      style={logoImageStyle(width, height)}
      width={width}
      height={height}
    />
  );
};
