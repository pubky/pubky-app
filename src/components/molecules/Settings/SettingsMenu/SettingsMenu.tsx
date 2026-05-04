'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
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
  const t = useTranslations('settings');

  return (
    <FilterRoot>
      <FilterHeader title={t('title')} />

      <FilterList>
        {SETTINGS_MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = pathname === item.path;
          return (
            <Link key={item.labelKey} href={item.path} data-cy={`settings-menu-item-${item.labelKey}`}>
              <FilterItem isSelected={isSelected} onClick={() => {}}>
                <FilterItemIcon icon={Icon} />
                <FilterItemLabel>{t(`menu.${item.labelKey}`)}</FilterItemLabel>
              </FilterItem>
            </Link>
          );
        })}
      </FilterList>
    </FilterRoot>
  );
}
