import * as React from 'react';

export interface SettingsSectionCardProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** When false, renders children directly without the bordered inner container. Default: true */
  wrapChildren?: boolean;
}
