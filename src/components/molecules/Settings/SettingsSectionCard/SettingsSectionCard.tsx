'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { SettingsSectionCardProps } from './SettingsSectionCard.types';

export function SettingsSectionCard({
  icon: Icon,
  title,
  description,
  children,
  className,
  wrapChildren = true,
}: SettingsSectionCardProps) {
  const hasHeader = Icon && title;

  return (
    <Container
      overrideDefaults
      className={cn('flex w-full flex-col items-start gap-8 rounded-md bg-card px-6 py-8 shadow-lg md:p-12', className)}
    >
      {(hasHeader || description) && (
        <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
          {hasHeader && (
            <Container overrideDefaults className="inline-flex items-center justify-start gap-3">
              <Icon size={24} />
              <Heading level={2} size="lg" className="leading-8">
                {title}
              </Heading>
            </Container>
          )}
          {description && (
            <Typography
              as="p"
              size="md"
              overrideDefaults
              className="text-base leading-6 font-medium text-secondary-foreground"
            >
              {description}
            </Typography>
          )}
        </Container>
      )}
      {wrapChildren ? (
        <Container
          overrideDefaults
          className="flex w-full flex-col items-start gap-8 rounded-md border border-border bg-card p-6 shadow-lg md:gap-6"
        >
          {children}
        </Container>
      ) : (
        children
      )}
    </Container>
  );
}
