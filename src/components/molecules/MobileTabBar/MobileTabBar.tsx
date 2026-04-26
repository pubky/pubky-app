'use client';

import * as Atoms from '@/atoms';
import type { MobileTabBarProps } from './MobileTabBar.types';
import { cn } from '@/libs/utils/utils';

/**
 * Shared mobile tab bar molecule used by Hot, Profile, and Settings pages.
 * Owns the visual + a11y contract for mobile tab navigation:
 * - Gradient fade background, `lg:hidden`, `--z-mobile-menu` z-index.
 * - Flex row of tab cells with active/inactive border + text color states.
 * - Icon-only or icon + label modes via `showLabels`.
 * - Positioning via `position` ('sticky' default, or 'fixed').
 *
 * Consumers own identity semantics (active detection, click handlers, i18n,
 * filtering) and pass already-resolved `MobileTabBarItem`s.
 */
export function MobileTabBar({
  items,
  showLabels = false,
  position = 'sticky',
  className,
  'data-testid': dataTestId,
}: MobileTabBarProps) {
  return (
    <Atoms.Container
      overrideDefaults
      data-testid={dataTestId}
      className={cn(
        'mobile-menu-gradient-fade z-(--z-mobile-menu) bg-background lg:hidden',
        position === 'sticky' && 'sticky top-(--header-height-mobile)',
        position === 'fixed' && 'fixed top-(--header-height-mobile) right-0 left-0',
        className,
      )}
    >
      <Atoms.Container overrideDefaults className="flex w-full">
        {items.map((item) => {
          const Icon = item.icon;
          const { isActive } = item;

          return (
            <Atoms.Container
              key={item.key}
              overrideDefaults
              className={cn(
                'flex flex-1 justify-center border-b px-0 py-1.5',
                isActive ? 'border-foreground' : 'border-border',
              )}
            >
              <Atoms.Button
                overrideDefaults
                onClick={item.onSelect}
                className={cn('px-2.5 py-2', showLabels && 'flex items-center gap-2')}
                aria-label={item.ariaLabel ?? item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={20} className={isActive ? 'text-foreground' : 'text-muted-foreground'} />
                {showLabels && (
                  <Atoms.Typography
                    as="span"
                    className={cn('text-sm font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}
                  >
                    {item.label}
                  </Atoms.Typography>
                )}
              </Atoms.Button>
            </Atoms.Container>
          );
        })}
      </Atoms.Container>
    </Atoms.Container>
  );
}
