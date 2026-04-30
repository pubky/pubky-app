'use client';
import { Container } from '@/atoms/Container/Container';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';

import type { SettingsSwitchItemProps } from './SettingsSwitchItem.types';

export function SettingsSwitchItem({ id, label, description, checked, disabled, onChange }: SettingsSwitchItemProps) {
  return (
    <Container overrideDefaults className="flex w-full items-center justify-between gap-3">
      <Container overrideDefaults className="flex flex-1 flex-col items-start gap-2">
        <Typography as="label" htmlFor={id} size="sm" className="leading-5 font-medium">
          {label}
        </Typography>
        {description && (
          <Typography size="sm" className="font-normal text-muted-foreground">
            {description}
          </Typography>
        )}
      </Container>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Container>
  );
}
