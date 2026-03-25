import { Switch as SwitchPrimitives } from 'radix-ui';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  id?: string;
}
