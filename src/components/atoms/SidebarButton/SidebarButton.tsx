import { Slot } from 'radix-ui';
import { Button } from '../Button/Button';
import type { SidebarButtonProps } from './SidebarButton.types';

export function SidebarButton({ icon: Icon, children, asChild = false, ...props }: SidebarButtonProps) {
  return (
    <Button
      variant="dark-outline"
      size="sm"
      className="w-full border-border bg-white/5 text-xs font-bold"
      asChild={asChild}
      {...props}
    >
      <Icon className="size-4" />
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
    </Button>
  );
}
