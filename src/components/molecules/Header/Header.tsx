'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Config from '@/config';
import * as App from '@/app';

export interface HeaderContainerProps {
  children: React.ReactNode;
  className?: string;
  classNameNav?: string;
}

export const HeaderContainer = ({ children, className, classNameNav }: HeaderContainerProps) => {
  return (
    <Atoms.Container
      overrideDefaults
      as="header"
      className={Libs.cn(
        'pointer-events-none sticky top-0 z-(--z-sticky-header) w-full bg-linear-to-b from-(--background) from-50% to-transparent py-6',
        className,
      )}
    >
      <Atoms.Container
        as="nav"
        size="container"
        className={Libs.cn(
          'pointer-events-auto mx-auto flex h-24 w-full flex-row flex-wrap items-center justify-between gap-4 sm:flex-nowrap sm:gap-6',
          'px-6 py-4 sm:py-6',
          classNameNav,
        )}
      >
        {children}
      </Atoms.Container>
    </Atoms.Container>
  );
};

export const HeaderTitle = ({ currentTitle }: { currentTitle: string }) => {
  return (
    <Atoms.Container className="hidden flex-1 md:flex">
      <Atoms.Heading level={2} size="lg" className="font-normal text-muted-foreground">
        {currentTitle}
      </Atoms.Heading>
    </Atoms.Container>
  );
};

export const HeaderOnboarding = ({ currentStep }: { currentStep: number }) => {
  return <Molecules.ProgressSteps currentStep={currentStep} totalSteps={5} />;
};

export function HeaderSocialLinks({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Atoms.Container
      data-testid="header-social-links"
      className={Libs.cn('mr-6 hidden flex-row justify-end gap-6 md:flex', props.className)}
    >
      <Atoms.Link href={Config.GITHUB_URL} target="_blank" variant="muted" size="default">
        <Libs.Github2 className="h-6 w-6" />
      </Atoms.Link>
      <Atoms.Link href={Config.TWITTER_GETPUBKY_URL} target="_blank" variant="muted" size="default">
        <Libs.XTwitter className="h-6 w-6" />
      </Atoms.Link>
      <Atoms.Link href={Config.TELEGRAM_URL} target="_blank" variant="muted" size="default">
        <Libs.Telegram className="h-6 w-6" />
      </Atoms.Link>
    </Atoms.Container>
  );
}

type NavigationItemConfig = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
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
  { href: App.APP_ROUTES.HOME, icon: Libs.Home, labelKey: 'home', dataCy: 'header-home-btn' },
  { href: App.APP_ROUTES.HOT, icon: Libs.Flame, labelKey: 'hot', dataCy: 'header-hot-btn' },
  { href: App.APP_ROUTES.BOOKMARKS, icon: Libs.Bookmark, labelKey: 'bookmarks', dataCy: 'header-bookmarks-btn' },
  { href: App.SETTINGS_ROUTES.ACCOUNT, icon: Libs.Settings, labelKey: 'settings', dataCy: 'header-settings-btn' },
];

type NavigationButtonProps = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  dataCy?: string;
};

const NavigationButton = ({ href, icon: Icon, label, isActive, dataCy }: NavigationButtonProps) => (
  <Atoms.Link href={href} data-cy={dataCy}>
    <Atoms.Button
      className={Libs.cn('h-12 w-12 backdrop-blur-md', isActive ? '' : 'border bg-white/5')}
      variant="secondary"
      size="icon"
      aria-label={label}
    >
      <Icon className="size-6" />
    </Atoms.Button>
  </Atoms.Link>
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
    <Atoms.Container className="hidden w-auto flex-row items-center justify-start gap-3 lg:flex">
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

      <Atoms.Link data-cy="header-nav-profile-btn" className="relative" href={App.APP_ROUTES.PROFILE}>
        <Organisms.AvatarWithFallback
          avatarUrl={avatarImage}
          name={avatarName}
          fallbackSeed={avatarSeed || avatarName}
          size="lg"
          className="cursor-pointer"
          alt={tCommon('profile')}
        />
        {counter > 0 && (
          <Atoms.Badge
            data-cy="header-notification-counter"
            className="absolute right-0 bottom-0 h-5 w-5 rounded-full bg-brand shadow-sm"
            variant="secondary"
          >
            <Atoms.Typography
              className={Libs.cn('font-semibold text-primary-foreground', counter > 21 && 'text-xs')}
              size="xs"
            >
              {counterString}
            </Atoms.Typography>
          </Atoms.Badge>
        )}
      </Atoms.Link>
    </Atoms.Container>
  );
}
