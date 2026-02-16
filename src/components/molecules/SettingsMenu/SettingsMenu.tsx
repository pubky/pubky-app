'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as Atoms from '@/atoms';
import { SETTINGS_MENU_ITEMS } from './SettingsMenu.constants';

export function SettingsMenu() {
  const pathname = usePathname();
  const t = useTranslations('settings');

  return (
    <Atoms.FilterRoot>
      <Atoms.FilterHeader title={t('title')} />

      <Atoms.FilterList>
        {SETTINGS_MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = pathname === item.path;
          return (
            <Link key={item.labelKey} href={item.path} data-cy={`settings-menu-item-${item.labelKey}`}>
              <Atoms.FilterItem isSelected={isSelected} onClick={() => {}}>
                <Atoms.FilterItemIcon icon={Icon} />
                <Atoms.FilterItemLabel>{t(`menu.${item.labelKey}`)}</Atoms.FilterItemLabel>
              </Atoms.FilterItem>
            </Link>
          );
        })}
      </Atoms.FilterList>
    </Atoms.FilterRoot>
  );
}
