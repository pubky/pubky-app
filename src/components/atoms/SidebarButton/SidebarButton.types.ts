import type { LucideIcon } from 'lucide-react';

export interface SidebarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  children: React.ReactNode;
}
