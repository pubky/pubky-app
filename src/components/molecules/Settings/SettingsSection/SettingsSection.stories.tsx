import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { User, Lock, Bell, Trash2, Download, Shield, Key, LogOut } from 'lucide-react';
import { fn } from 'storybook/test';

import { SettingsSection } from './SettingsSection';

const meta = {
  title: 'Molecules/SettingsSection',
  component: SettingsSection,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    icon: {
      description: 'Icon component to display',
      control: false,
    },
    buttonIcon: {
      description: 'Icon component for the button',
      control: false,
    },
    buttonVariant: {
      control: 'select',
      options: ['secondary', 'destructive'],
      description: 'Visual variant of the button',
    },
    buttonDisabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
  },
} satisfies Meta<typeof SettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: User,
    title: 'Account Settings',
    description: 'Manage your account preferences and security settings.',
    buttonText: 'Edit Account',
    buttonIcon: User,
    buttonId: 'edit-account',
    buttonOnClick: fn(),
  },
};

export const PrivacySettings: Story = {
  args: {
    icon: Lock,
    title: 'Privacy & Security',
    description: 'Control who can see your content and interact with you on the platform.',
    buttonText: 'Manage Privacy',
    buttonIcon: Shield,
    buttonId: 'manage-privacy',
    buttonOnClick: fn(),
  },
};

export const NotificationSettings: Story = {
  args: {
    icon: Bell,
    title: 'Notifications',
    description: 'Choose what notifications you receive and how you want to be notified.',
    buttonText: 'Configure Notifications',
    buttonIcon: Bell,
    buttonId: 'configure-notifications',
    buttonOnClick: fn(),
  },
};

export const DestructiveAction: Story = {
  args: {
    icon: Trash2,
    title: 'Delete Account',
    description: 'Permanently delete your account and all associated data. This action cannot be undone.',
    buttonText: 'Delete Account',
    buttonIcon: Trash2,
    buttonId: 'delete-account',
    buttonVariant: 'destructive',
    buttonOnClick: fn(),
  },
};

export const BackupData: Story = {
  args: {
    icon: Download,
    title: 'Backup Your Data',
    description: 'Download a copy of your account data including posts, profile information, and settings.',
    buttonText: 'Download Backup',
    buttonIcon: Download,
    buttonId: 'download-backup',
    buttonOnClick: fn(),
  },
};

export const RecoveryPhrase: Story = {
  args: {
    icon: Key,
    title: 'Recovery Phrase',
    description: 'View and backup your recovery phrase. Keep this secure and never share it with anyone.',
    buttonText: 'Show Recovery Phrase',
    buttonIcon: Key,
    buttonId: 'show-recovery',
    buttonOnClick: fn(),
  },
};

export const DisabledButton: Story = {
  args: {
    icon: LogOut,
    title: 'Sign Out',
    description: 'You cannot sign out while there are pending changes. Please save or discard your changes first.',
    buttonText: 'Sign Out',
    buttonIcon: LogOut,
    buttonId: 'sign-out',
    buttonDisabled: true,
    buttonOnClick: fn(),
  },
};

export const WithCustomStyling: Story = {
  args: {
    icon: Shield,
    title: 'Security Settings',
    description: 'Enhanced security options for your account.',
    buttonText: 'Update Security',
    buttonIcon: Shield,
    buttonId: 'update-security',
    titleClassName: 'text-brand',
    iconClassName: 'text-brand',
    buttonOnClick: fn(),
  },
};
