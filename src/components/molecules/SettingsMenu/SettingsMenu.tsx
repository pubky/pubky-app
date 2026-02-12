'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { SETTINGS_ROUTES } from '@/app';

export interface SettingsMenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
  path: string;
}

const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  { icon: Libs.UserRound, labelKey: 'account', path: SETTINGS_ROUTES.ACCOUNT },
  { icon: Libs.Bell, labelKey: 'notifications', path: SETTINGS_ROUTES.NOTIFICATIONS },
  { icon: Libs.Shield, labelKey: 'privacySafety', path: SETTINGS_ROUTES.PRIVACY_SAFETY },
  { icon: Libs.MegaphoneOff, labelKey: 'mutedUsers', path: SETTINGS_ROUTES.MUTED_USERS },
  { icon: Libs.Globe, labelKey: 'language', path: SETTINGS_ROUTES.LANGUAGE },
  { icon: Libs.CircleHelp, labelKey: 'help', path: SETTINGS_ROUTES.HELP },
];

export interface SettingsMenuProps {
  className?: string;
}

export function SettingsMenu({ className }: SettingsMenuProps) {
  const pathname = usePathname();
  const t = useTranslations('settings');

  return (
    <Atoms.FilterRoot className={className}>
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
