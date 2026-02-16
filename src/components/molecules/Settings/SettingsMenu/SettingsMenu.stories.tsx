import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsMenu } from './SettingsMenu';

const meta: Meta<typeof SettingsMenu> = {
  title: 'Templates/Settings/SettingsMenu',
  component: SettingsMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Settings navigation menu component used in the Settings page.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
