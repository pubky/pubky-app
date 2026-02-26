import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsInfo } from './SettingsInfo';

const meta: Meta<typeof SettingsInfo> = {
  title: 'Templates/Settings/SettingsInfo',
  component: SettingsInfo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Settings information sidebar with Terms, FAQ, and version information for the Settings page.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
