'use client';

import * as Atoms from '@/atoms';
import type { SettingsSwitchGroupProps } from './SettingsSwitchGroup.types';

export function SettingsSwitchGroup({ children }: SettingsSwitchGroupProps) {
  return (
    <Atoms.Container overrideDefaults className="flex w-full flex-col items-start gap-6">
      {children}
    </Atoms.Container>
  );
}
