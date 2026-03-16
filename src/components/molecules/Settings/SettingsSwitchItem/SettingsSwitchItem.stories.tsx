import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { SettingsSwitchItem } from './SettingsSwitchItem';

const meta = {
  title: 'Molecules/SettingsSwitchItem',
  component: SettingsSwitchItem,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
  args: { onChange: fn() },
} satisfies Meta<typeof SettingsSwitchItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: 'switch-1',
    label: 'Enable notifications',
    checked: false,
  },
};

export const Checked: Story = {
  args: {
    id: 'switch-2',
    label: 'Enable notifications',
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    id: 'switch-3',
    label: 'Enable notifications',
    checked: false,
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    id: 'switch-4',
    label: 'Enable notifications',
    checked: true,
    disabled: true,
  },
};
