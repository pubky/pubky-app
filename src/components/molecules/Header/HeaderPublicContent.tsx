'use client';

import type * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { getGithubLink, getTelegramLink, getTwitterGetpubkyLink } from '@/config/externalLinks';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { Github2, Telegram, XTwitter } from '@/icons';
import { cn } from '@/libs/utils/utils';

interface HeaderContainerProps {
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
