import type { LucideIcon } from 'lucide-react';

export interface SidebarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  icon: LucideIcon;
  children: React.ReactNode;
}
