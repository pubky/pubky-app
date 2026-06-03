'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Link } from '@/atoms/Link/Link';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';

interface LogoProps {
  width?: number;
  height?: number;
  noLink?: boolean;
}

export function Logo({
  width = 109,
  height = 36,
  noLink = false,
  ...props
}: LogoProps & React.HTMLAttributes<HTMLAnchorElement>) {
  const pathname = usePathname();
  const isHome = pathname === '/home';

  return !noLink ? (
    <Link
      href="/home"
      data-cy="header-logo"
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) return;
        handleFeedNavClick(event, { isActive: isHome, smoothScrollWhenActive: true });
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
