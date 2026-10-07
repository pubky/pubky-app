'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, Home, Library, Settings, Store, UserRoundPlus } from 'lucide-react';
import { APP_ROUTES, isCoreExploreRoute, isNavItemActive, SETTINGS_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { getGithubLink, getShopLink, getTelegramLink, getTwitterGetpubkyLink } from '@/config/externalLinks';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { Github2, Telegram, XTwitter } from '@/icons';
import { handleFeedNavClick } from '@/libs/utils/feedScrollTop';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { useAuthStore } from '@/stores/auth/auth.store';
import { ProgressSteps } from '../ProgressSteps/ProgressSteps';

export interface HeaderContainerProps {
  children: React.ReactNode;
  className?: string;
}
export const HeaderContainer = ({ children, className }: HeaderContainerProps) => {
  return (
    <Container
      overrideDefaults
      as="header"
      className={cn(
        'pointer-events-none sticky top-0 z-(--z-sticky-header) w-full bg-linear-to-b from-(--background) from-50% to-transparent p-0 sm:py-6',
        className,
      )}
    >
      <Container
        as="nav"
        size="container"
        className={cn(
          'pointer-events-auto mx-auto flex h-24 w-full flex-row flex-wrap items-center justify-between gap-4 py-6 sm:flex-nowrap sm:gap-6',
          CONTENT_GUTTER_CLASS,
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
  return <ProgressSteps currentStep={currentStep} totalSteps={4} />;
};
export function HeaderSocialLinks({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Container
      data-testid="header-social-links"
      className={cn('mr-6 hidden flex-row justify-end gap-6 md:flex', props.className)}
    >
      <Link href={getGithubLink()} target="_blank" variant="muted" size="default" aria-label="GitHub">
        <Github2 className="h-6 w-6" aria-hidden="true" />
      </Link>
      <Link href={getTwitterGetpubkyLink()} target="_blank" variant="muted" size="default" aria-label="X">
        <XTwitter className="h-6 w-6" aria-hidden="true" />
      </Link>
      <Link href={getTelegramLink()} target="_blank" variant="muted" size="default" aria-label="Telegram">
        <Telegram className="h-6 w-6" aria-hidden="true" />
      </Link>
    </Container>
  );
}
type NavigationItemConfig = {
  href: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  label: string;
  dataCy?: string;
  activePrefix?: string;
  isFeedRoute?: boolean;
  external?: boolean;
};
type HeaderNavigationButtonsProps = {
  counter?: number;
  avatarImage?: string;
  avatarName?: string;
  avatarSeed?: string;
  className?: string;
};
const getNavigationItems = (): NavigationItemConfig[] => [
  {
    href: APP_ROUTES.HOME,
    icon: Home,
    label: 'Home',
    dataCy: 'header-home-btn',
    isFeedRoute: true,
  },
  {
    href: APP_ROUTES.HOT,
    icon: Flame,
    label: 'Hot',
    dataCy: 'header-hot-btn',
  },
  { href: getShopLink(), icon: Store, label: 'Shop', dataCy: 'header-shop-btn', external: true },
  {
    href: APP_ROUTES.COLLECTIONS,
    icon: Library,
    label: 'Collections',
    dataCy: 'header-collections-btn',
    activePrefix: APP_ROUTES.COLLECTIONS,
  },
  {
    href: SETTINGS_ROUTES.ACCOUNT,
    icon: Settings,
    label: 'Settings',
    dataCy: 'header-settings-btn',
    activePrefix: APP_ROUTES.SETTINGS,
  },
];
type NavigationButtonProps = {
  /** Present → navigates client-side via Link. Omit (and pass onClick) for auth-gated items. */
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{
    className?: string;
  }>;
  label: string;
  isActive: boolean;
  dataCy?: string;
  isFeedRoute?: boolean;
  external?: boolean;
};
const NavigationButton = ({
  href,
  onClick,
  icon: Icon,
  label,
  isActive,
  dataCy,
  isFeedRoute,
  external,
}: NavigationButtonProps) => {
  const button = (
    <Button
      data-cy={href ? undefined : dataCy}
      className={cn('h-12 w-12 backdrop-blur-md', isActive ? '' : 'border bg-white/5')}
      variant="secondary"
      size="icon"
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="size-6" />
    </Button>
  );
  return href ? (
    <Link
      href={href}
      target={external ? '_self' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      data-cy={dataCy}
      onClick={
        isFeedRoute ? (event) => handleFeedNavClick(event, { isActive, smoothScrollWhenActive: true }) : undefined
      }
    >
      {button}
    </Link>
  ) : (
    button
  );
};
export function HeaderNavigationButtons({
  counter = 0,
  avatarImage,
  avatarName = 'U',
  avatarSeed,
  className,
}: HeaderNavigationButtonsProps) {
  const pathname = usePathname();
  const counterString = counter > 21 ? '21+' : counter.toString();
  return (
    <Container className={cn('hidden w-auto flex-row items-center justify-start gap-3 lg:flex', className)}>
      {getNavigationItems().map((item) => (
        <NavigationButton
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={item.label}
          isActive={!item.external && isNavItemActive(pathname, item)}
          external={item.external}
          dataCy={item.dataCy}
          isFeedRoute={item.isFeedRoute}
        />
      ))}

      <Link data-cy="header-nav-profile-btn" className="relative" href={APP_ROUTES.PROFILE}>
        <AvatarWithFallback
          avatarUrl={avatarImage}
          name={avatarName}
          fallbackSeed={avatarSeed || avatarName}
          size="lg"
          className="cursor-pointer"
          alt={'Profile'}
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

type HeaderExploreNavigationButtonsProps = {
  className?: string;
  showSearch?: boolean;
};

export function HeaderExploreNavigationButtons({
  className,
  showSearch = true,
}: HeaderExploreNavigationButtonsProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);

  return (
    <Container className={cn('hidden min-w-0 flex-1 flex-row items-center justify-end gap-3 lg:flex', className)}>
      {showSearch && <SearchInput />}
      {getNavigationItems().map((item) => {
        // Core explore routes navigate freely; Settings requires an account.
        const requiresAuth = !item.external && !isCoreExploreRoute(item.href);
        return (
          <NavigationButton
            key={item.href}
            href={requiresAuth ? undefined : item.href}
            onClick={requiresAuth ? () => requireAuth(() => router.push(item.href)) : undefined}
            icon={item.icon}
            label={item.label}
            isActive={!item.external && isNavItemActive(pathname, item)}
            external={item.external}
            dataCy={item.dataCy}
          />
        );
      })}

      <Button
        variant="secondary"
        size="icon"
        className="h-12 w-12 border bg-white/5"
        onClick={() => setShowSignInDialog(true)}
        aria-label="Join Pubky"
        data-testid="header-explore-join-button"
      >
        <UserRoundPlus className="size-6" />
      </Button>
    </Container>
  );
}
