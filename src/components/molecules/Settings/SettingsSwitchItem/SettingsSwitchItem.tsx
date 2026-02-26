'use client';

import * as Atoms from '@/atoms';
import type { SettingsSwitchItemProps } from './SettingsSwitchItem.types';

export function SettingsSwitchItem({ id, label, description, checked, disabled, onChange }: SettingsSwitchItemProps) {
  return (
    <Atoms.Container overrideDefaults className="flex w-full items-center justify-between gap-3">
      <Atoms.Container overrideDefaults className="flex flex-1 flex-col items-start gap-2">
        <Atoms.Typography as="label" htmlFor={id} size="sm" className="leading-5 font-medium">
          {label}
        </Atoms.Typography>
        {description && (
          <Atoms.Typography size="sm" className="font-normal text-muted-foreground">
            {description}
          </Atoms.Typography>
        )}
      </Atoms.Container>
      <Atoms.Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Atoms.Container>
  );
}
