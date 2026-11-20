'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_ROUTES } from '@/app/routes';
import {
  FilterHeader,
  FilterItem,
  FilterItemIcon,
  FilterItemLabel,
  FilterList,
  FilterRoot,
} from '@/atoms/Filter/Filter';
import { isPinakesConfigured } from '@/config/pinakes';
import { SETTINGS_MENU_ITEMS } from './SettingsMenu.constants';

export function SettingsMenu() {
  const pathname = usePathname();
  // Links & Media sets how external resource cards play: none without Pinakes.
  const items = SETTINGS_MENU_ITEMS.filter((item) => item.path !== SETTINGS_ROUTES.MEDIA || isPinakesConfigured());

  return (
    <FilterRoot>
      <FilterHeader title={'Settings'} />

      <FilterList>
        {items.map((item) => {
          const Icon = item.icon;
          const isSelected = pathname === item.path;
          return (
            <Link key={item.id} href={item.path} data-cy={`settings-menu-item-${item.id}`}>
              <FilterItem isSelected={isSelected} onClick={() => {}}>
                <FilterItemIcon icon={Icon} />
                <FilterItemLabel>{item.label}</FilterItemLabel>
              </FilterItem>
            </Link>
          );
        })}
      </FilterList>
    </FilterRoot>
  );
}
