import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SettingsSwitchGroup } from './SettingsSwitchGroup';
import { SettingsSwitchItem } from '../SettingsSwitchItem';

const meta = {
  title: 'Molecules/SettingsSwitchGroup',
  component: SettingsSwitchGroup,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SettingsSwitchGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <SettingsSwitchItem id="item-1" label="Option 1" checked={true} />
        <SettingsSwitchItem id="item-2" label="Option 2" checked={false} />
        <SettingsSwitchItem id="item-3" label="Option 3" checked={true} />
      </>
    ),
  },
};

export const WithDisabled: Story = {
  args: {
    children: (
      <>
        <SettingsSwitchItem id="item-1" label="Enabled option" checked={true} />
        <SettingsSwitchItem id="item-2" label="Disabled option" checked={false} disabled />
        <SettingsSwitchItem id="item-3" label="Another enabled" checked={true} />
      </>
    ),
  },
};
