import type { LucideIcon } from 'lucide-react';

export interface SidebarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  children: React.ReactNode;
  /** Render the single child (e.g. a link) with the button's styles, the icon placed inside it. */
  asChild?: boolean;
}
