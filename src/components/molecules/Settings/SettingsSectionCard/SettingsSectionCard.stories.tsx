import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { User, Bell, ShieldCheck } from 'lucide-react';

import { SettingsSectionCard } from './SettingsSectionCard';

const meta = {
  title: 'Molecules/SettingsSectionCard',
  component: SettingsSectionCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SettingsSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: User,
    title: 'Account Settings',
    children: <div className="text-sm">This is the content area</div>,
  },
};

export const WithDescription: Story = {
  args: {
    icon: Bell,
    title: 'Notifications',
    description: 'Manage your notification preferences',
    children: <div className="text-sm">Notification settings content</div>,
  },
};

export const Privacy: Story = {
  args: {
    icon: ShieldCheck,
    title: 'Privacy & Safety',
    description: 'Control your privacy and safety settings',
    children: (
      <div className="flex flex-col gap-4">
        <div className="text-sm">Privacy setting 1</div>
        <div className="text-sm">Privacy setting 2</div>
      </div>
    ),
  },
};
