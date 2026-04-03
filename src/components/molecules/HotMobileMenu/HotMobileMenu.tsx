'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { useTranslations } from 'next-intl';
import { HotSection, type HotMobileMenuItem, type HotMobileMenuProps } from './HotMobileMenu.types';

export const HOT_MOBILE_MENU_ITEMS: HotMobileMenuItem[] = [
  { icon: Libs.Tag, section: HotSection.TAGS },
  { icon: Libs.UsersRound, section: HotSection.USERS },
  { icon: Libs.StickyNote, section: HotSection.POSTS },
];

/**
 * Mobile navigation menu for the Hot page.
 * Shows 3 tabs with icon + text: Tags, Users, Posts.
 * Only visible on mobile (< lg breakpoint).
 * Follows same positioning pattern as ProfilePageMobileMenu.
 *
 * Negative margin overrides:
 * - `-mx-6` cancels the parent ContentLayout container's `px-6` padding
 *   so the menu stretches full-width edge-to-edge.
 * - `-mt-6` cancels the parent flex container's `gap-6` above so the menu sits
 *   flush against the header, preventing a layout shift when sticky activates.
 */
export function HotMobileMenu({ activeSection, onSectionChange }: HotMobileMenuProps) {
  const t = useTranslations('hot');

  return (
    <Atoms.Container
      overrideDefaults
      data-testid="hot-mobile-menu"
      className="mobile-menu-gradient-fade sticky top-(--header-height-mobile) z-(--z-mobile-menu) -mx-6 -mt-6 mb-6 bg-background lg:hidden"
    >
      <Atoms.Container overrideDefaults className="flex w-full">
        {HOT_MOBILE_MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = item.section === activeSection;

          return (
            <Atoms.Container
              key={item.section}
              overrideDefaults
              className={Libs.cn(
                'flex flex-1 justify-center border-b px-0 py-1.5',
                isSelected ? 'border-foreground' : 'border-border',
              )}
            >
              <Atoms.Button
                overrideDefaults
                onClick={() => onSectionChange(item.section)}
                className="flex items-center gap-2 px-2.5 py-2"
                aria-label={t(item.section)}
                aria-current={isSelected ? 'page' : undefined}
              >
                <Icon size={20} className={isSelected ? 'text-foreground' : 'text-muted-foreground'} />
                <Atoms.Typography
                  as="span"
                  className={Libs.cn('text-sm font-medium', isSelected ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {t(item.section)}
                </Atoms.Typography>
              </Atoms.Button>
            </Atoms.Container>
          );
        })}
      </Atoms.Container>
    </Atoms.Container>
  );
}
