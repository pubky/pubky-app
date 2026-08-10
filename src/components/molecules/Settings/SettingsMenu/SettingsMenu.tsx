'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FilterHeader,
  FilterItem,
  FilterItemIcon,
  FilterItemLabel,
  FilterList,
  FilterRoot,
} from '@/atoms/Filter/Filter';
import { SETTINGS_MENU_ITEMS } from './SettingsMenu.constants';

export function SettingsMenu() {
  const pathname = usePathname();

  return (
    <FilterRoot>
      <FilterHeader title={'Settings'} />

      <FilterList>
        {SETTINGS_MENU_ITEMS.map((item) => {
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
