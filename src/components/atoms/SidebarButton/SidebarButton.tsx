import { Slot } from 'radix-ui';
import { Button } from '../Button/Button';
import type { SidebarButtonProps } from './SidebarButton.types';

export function SidebarButton({ icon: Icon, children, asChild = false, ...props }: SidebarButtonProps) {
  return (
    <Button
      asChild={asChild}
      variant="dark-outline"
      size="sm"
      className="w-full border-border bg-glass text-xs font-bold"
      {...props}
    >
      <Icon className="size-4" />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Button>
  );
}
