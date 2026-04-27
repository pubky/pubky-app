'use client';

import * as Atoms from '@/atoms';
import type { SidebarSectionProps } from './SidebarSection.types';
import { cn } from '@/libs/utils/utils';

/**
 * SidebarSection
 *
 * Reusable section wrapper for sidebar content.
 * Includes title, optional header action, content area, and optional footer button.
 */
export function SidebarSection({
  title,
  children,
  headerActionIcon: HeaderActionIcon,
  onHeaderAction,
  headerActionLabel,
  footerIcon,
  footerText,
  onFooterClick,
  footerTestId,
  footerDataCy,
  className,
  dataCy,
  'data-testid': dataTestId,
}: SidebarSectionProps) {
  return (
    <Atoms.Container
      overrideDefaults
      className={cn('flex w-full min-w-0 flex-col gap-2', className)}
      data-cy={dataCy}
      data-testid={dataTestId}
    >
      {/* Header */}
      <Atoms.Container overrideDefaults className="flex w-full items-center justify-between">
        <Atoms.Heading level={2} size="lg" className="font-light text-muted-foreground">
          {title}
        </Atoms.Heading>
        {HeaderActionIcon && onHeaderAction && (
          <Atoms.Button
            overrideDefaults
            onClick={onHeaderAction}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={headerActionLabel || 'Action'}
          >
            <HeaderActionIcon className="size-5" />
          </Atoms.Button>
        )}
      </Atoms.Container>

      {/* Content */}
      <Atoms.Container overrideDefaults className="flex w-full min-w-0 flex-col gap-2">
        {children}
      </Atoms.Container>

      {/* Footer */}
      {footerIcon && footerText && (
        <Atoms.SidebarButton
          icon={footerIcon}
          onClick={onFooterClick}
          data-cy={footerDataCy}
          data-testid={footerTestId}
        >
          {footerText}
        </Atoms.SidebarButton>
      )}
    </Atoms.Container>
  );
}
