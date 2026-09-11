'use client';
import { forwardRef, useEffect, useRef } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { MobileTabBarHeaderTop, MobileTabBarProps } from './MobileTabBar.types';

/**
 * Shared mobile tab bar molecule used by Hot, Profile, and Settings pages.
 * Owns the visual + a11y contract for mobile tab navigation:
 * - Gradient fade background, `lg:hidden`, `--z-mobile-menu` z-index.
 * - Flex row of tab cells with active/inactive border + text color states.
 * - Icon-only or icon + label modes via `showLabels`.
 * - Positioning via `position` ('sticky' default, or 'fixed').
 *
 * Consumers own identity semantics (active detection, click handlers, i18n,
 * filtering) and pass already-resolved `MobileTabBarItem`s. Consumers may
 * attach a ref to read the root element (e.g. to measure its position when
 * the bar is sticky).
 */
const HEADER_TOP_CLASS: Record<MobileTabBarHeaderTop, string> = {
  mobile: 'top-(--header-height-mobile)',
  compact: 'top-(--header-height-settings)',
};

export const MobileTabBar = forwardRef<HTMLDivElement, MobileTabBarProps>(function MobileTabBar(
  { items, showLabels = false, position = 'sticky', headerTop = 'mobile', className, 'data-testid': dataTestId },
  ref,
) {
  const topClass = HEADER_TOP_CLASS[headerTop];
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemIndex = items.findIndex((item) => item.isActive);
  const activeItemKey = activeItemIndex >= 0 ? items[activeItemIndex].key : undefined;

  useEffect(() => {
    if (activeItemIndex < 0) return;
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const alignActiveTab = () => {
      const activeTab = scrollContainer.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activeTab) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const activeTabRect = activeTab.getBoundingClientRect();
      const leftOverflow = activeTabRect.left - containerRect.left;
      const rightOverflow = activeTabRect.right - containerRect.right;

      // Keep scrolling local: scrollIntoView can also move the page and make the sticky bar jump.
      if (leftOverflow < 0) scrollContainer.scrollBy({ left: leftOverflow });
      else if (rightOverflow > 0) scrollContainer.scrollBy({ left: rightOverflow });
    };

    alignActiveTab();
    const resizeObserver = new ResizeObserver(alignActiveTab);
    resizeObserver.observe(scrollContainer);
    return () => resizeObserver.disconnect();
  }, [activeItemIndex, activeItemKey]);

  return (
    <Container
      ref={ref}
      overrideDefaults
      data-testid={dataTestId}
      className={cn(
        'mobile-menu-gradient-fade z-(--z-mobile-menu) bg-background lg:hidden',
        position === 'sticky' && cn('sticky', topClass),
        position === 'fixed' && cn('fixed right-0 left-0', topClass),
        className,
      )}
    >
      <Container
        ref={scrollContainerRef}
        overrideDefaults
        data-testid="mobile-tab-bar-scroll-container"
        className="flex w-full overflow-x-auto"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const { isActive } = item;

          return (
            <Container
              key={item.key}
              overrideDefaults
              className={cn(
                'flex flex-1 justify-center border-b px-0 py-1.5',
                isActive ? 'border-foreground' : 'border-border',
              )}
            >
              <Button
                overrideDefaults
                onClick={item.onSelect}
                className={cn('px-2.5 py-2', showLabels && 'flex items-center gap-2')}
                aria-label={item.ariaLabel ?? item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={20} className={isActive ? 'text-foreground' : 'text-muted-foreground'} />
                {showLabels && (
                  <Typography
                    as="span"
                    className={cn('text-sm font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}
                  >
                    {item.label}
                  </Typography>
                )}
              </Button>
            </Container>
          );
        })}
      </Container>
    </Container>
  );
});
