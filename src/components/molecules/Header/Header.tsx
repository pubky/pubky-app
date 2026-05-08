'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Bookmark, Flame, Home, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, SETTINGS_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { GITHUB_URL, TELEGRAM_URL, TWITTER_GETPUBKY_URL } from '@/config/externalLinks';
import { Github2, Telegram, XTwitter } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { ProgressSteps } from '../ProgressSteps/ProgressSteps';

export interface HeaderContainerProps {
  children: React.ReactNode;
  className?: string;
  classNameNav?: string;
}
export const HeaderContainer = ({ children, className, classNameNav }: HeaderContainerProps) => {
  return (
    <Container
      overrideDefaults
      as="header"
      className={cn(
        'pointer-events-none sticky top-0 z-(--z-sticky-header) w-full bg-linear-to-b from-(--background) from-50% to-transparent p-6',
        className,
      )}
    >
      <Container
        as="nav"
        size="container"
        className={cn(
          'pointer-events-auto mx-auto flex h-24 w-full flex-row flex-wrap items-center justify-between gap-4 sm:flex-nowrap sm:gap-6',
          'p-6',
          classNameNav,
        )}
      >
        {children}
      </Container>
    </Container>
  );
};
export const HeaderTitle = ({ currentTitle }: { currentTitle: string }) => {
  return (
    <Container className="hidden flex-1 md:flex">
      <Heading level={2} size="lg" className="font-normal text-muted-foreground">
        {currentTitle}
      </Heading>
    </Container>
  );
};
export const HeaderOnboarding = ({ currentStep }: { currentStep: number }) => {
  return <ProgressSteps currentStep={currentStep} totalSteps={5} />;
};
export function HeaderSocialLinks({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Container
      data-testid="header-social-links"
      className={cn('mr-6 hidden flex-row justify-end gap-6 md:flex', props.className)}
    >
      <Link href={GITHUB_URL} target="_blank" variant="muted" size="default">
        <Github2 className="h-6 w-6" />
      </Link>
      <Link href={TWITTER_GETPUBKY_URL} target="_blank" variant="muted" size="default">
        <XTwitter className="h-6 w-6" />
      </Link>
      <Link href={TELEGRAM_URL} target="_blank" variant="muted" size="default">
        <Telegram className="h-6 w-6" />
      </Link>
    </Container>
  );
}
type NavigationItemConfig = {
  href: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  labelKey: string;
  dataCy?: string;
};
type HeaderNavigationButtonsProps = {
  counter?: number;
  avatarImage?: string;
  avatarName?: string;
  avatarSeed?: string;
};
const NAVIGATION_ITEMS: NavigationItemConfig[] = [
  {
    href: APP_ROUTES.HOME,
    icon: Home,
    labelKey: 'home',
    dataCy: 'header-home-btn',
  },
  {
    href: APP_ROUTES.HOT,
    icon: Flame,
    labelKey: 'hot',
    dataCy: 'header-hot-btn',
  },
  {
    href: APP_ROUTES.BOOKMARKS,
    icon: Bookmark,
    labelKey: 'bookmarks',
    dataCy: 'header-bookmarks-btn',
  },
  {
    href: SETTINGS_ROUTES.ACCOUNT,
    icon: Settings,
    labelKey: 'settings',
    dataCy: 'header-settings-btn',
  },
];
type NavigationButtonProps = {
  href: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  label: string;
  isActive: boolean;
  dataCy?: string;
};
const NavigationButton = ({ href, icon: Icon, label, isActive, dataCy }: NavigationButtonProps) => (
  <Link href={href} data-cy={dataCy}>
    <Button
      className={cn('h-12 w-12 backdrop-blur-md', isActive ? '' : 'border bg-white/5')}
      variant="secondary"
      size="icon"
      aria-label={label}
    >
      <Icon className="size-6" />
    </Button>
  </Link>
);
export function HeaderNavigationButtons({
  counter = 0,
  avatarImage,
  avatarName = 'U',
  avatarSeed,
}: HeaderNavigationButtonsProps) {
  const pathname = usePathname();
  const t = useTranslations('header');
  const tCommon = useTranslations('common');
  const counterString = counter > 21 ? '21+' : counter.toString();
  return (
    <Container className="hidden w-auto flex-row items-center justify-start gap-3 lg:flex">
      {NAVIGATION_ITEMS.map((item) => (
        <NavigationButton
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={t(item.labelKey)}
          isActive={pathname === item.href}
          dataCy={item.dataCy}
        />
      ))}

      <Link data-cy="header-nav-profile-btn" className="relative" href={APP_ROUTES.PROFILE}>
        <AvatarWithFallback
          avatarUrl={avatarImage}
          name={avatarName}
          fallbackSeed={avatarSeed || avatarName}
          size="lg"
          className="cursor-pointer"
          alt={tCommon('profile')}
        />
        {counter > 0 && (
          <Badge
            data-cy="header-notification-counter"
            className="absolute right-0 bottom-0 h-5 w-5 rounded-full bg-brand shadow-sm"
            variant="secondary"
          >
            <Typography className={cn('font-semibold text-primary-foreground', counter > 21 && 'text-xs')} size="xs">
              {counterString}
            </Typography>
          </Badge>
        )}
      </Link>
    </Container>
  );
}
