'use client';
import { Container } from '@/atoms/Container/Container';
import type { SettingsSwitchGroupProps } from './SettingsSwitchGroup.types';

export function SettingsSwitchGroup({ children }: SettingsSwitchGroupProps) {
  return (
    <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
      {children}
    </Container>
  );
}
