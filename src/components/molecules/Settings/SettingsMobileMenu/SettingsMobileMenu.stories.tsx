import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SettingsMobileMenu } from './SettingsMobileMenu';

const meta = {
  title: 'Molecules/SettingsMobileMenu',
  component: SettingsMobileMenu,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SettingsMobileMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
