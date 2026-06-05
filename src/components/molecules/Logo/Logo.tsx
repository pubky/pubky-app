'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { APP_ROUTES, isLogoLandingRoute, ROOT_ROUTES } from '@/app/routes';
import { Link } from '@/atoms/Link/Link';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';

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
        handleFeedNavClick(event, { isActive: isHome, smoothScrollWhenActive: true });
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
