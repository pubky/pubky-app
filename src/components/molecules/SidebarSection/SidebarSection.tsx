'use client';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { SidebarButton } from '@/atoms/SidebarButton/SidebarButton';
import { cn } from '@/libs/utils/utils';
import type { SidebarSectionProps } from './SidebarSection.types';

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
    <Container
      overrideDefaults
      className={cn('flex w-full min-w-0 flex-col gap-2', className)}
      data-cy={dataCy}
      data-testid={dataTestId}
    >
      {/* Header */}
      <Container overrideDefaults className="flex w-full items-center justify-between">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {title}
        </Heading>
        {HeaderActionIcon && onHeaderAction && (
          <Button
            overrideDefaults
            onClick={onHeaderAction}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={headerActionLabel || 'Action'}
          >
            <HeaderActionIcon className="size-5" />
          </Button>
        )}
      </Container>

      {/* Content */}
      <Container overrideDefaults className="flex w-full min-w-0 flex-col gap-2">
        {children}
      </Container>

      {/* Footer */}
      {footerIcon && footerText && (
        <SidebarButton icon={footerIcon} onClick={onFooterClick} data-cy={footerDataCy} data-testid={footerTestId}>
          {footerText}
        </SidebarButton>
      )}
    </Container>
  );
}
