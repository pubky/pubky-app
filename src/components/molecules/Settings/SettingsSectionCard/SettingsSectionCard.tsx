'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
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
    <Atoms.Container
      overrideDefaults
      className={Libs.cn('flex w-full flex-col items-start gap-8 rounded-md bg-card px-6 py-8 md:p-12', className)}
    >
      {(hasHeader || description) && (
        <Atoms.Container overrideDefaults className="flex w-full flex-col items-start gap-6">
          {hasHeader && (
            <Atoms.Container overrideDefaults className="inline-flex items-center justify-start gap-3">
              <Icon size={24} />
              <Atoms.Heading level={2} size="lg" className="leading-8">
                {title}
              </Atoms.Heading>
            </Atoms.Container>
          )}
          {description && (
            <Atoms.Typography
              as="p"
              size="md"
              overrideDefaults
              className="text-base leading-6 font-medium text-secondary-foreground"
            >
              {description}
            </Atoms.Typography>
          )}
        </Atoms.Container>
      )}
      {wrapChildren ? (
        <Atoms.Container
          overrideDefaults
          className="flex w-full flex-col items-start gap-8 rounded-md border border-border bg-card p-6 shadow-lg md:gap-6"
        >
          {children}
        </Atoms.Container>
      ) : (
        children
      )}
    </Atoms.Container>
  );
}
