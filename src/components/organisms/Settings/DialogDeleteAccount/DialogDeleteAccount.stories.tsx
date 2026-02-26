import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { DialogDeleteAccount } from '@/organisms';

const meta = {
  title: 'Molecules/DialogDeleteAccount',
  component: DialogDeleteAccount,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    isOpen: { control: 'boolean' },
    onOpenChangeAction: { action: 'openChange' },
  },
  args: {
    isOpen: true,
    onOpenChangeAction: () => {},
  },
} satisfies Meta<typeof DialogDeleteAccount>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper component to handle state properly in Storybook
const DialogWrapper = ({ initialOpen = true }: { initialOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return <DialogDeleteAccount isOpen={isOpen} onOpenChangeAction={setIsOpen} />;
};

export const Default: Story = {
  args: {
    isOpen: true,
    onOpenChangeAction: () => {},
  },
  render: () => <DialogWrapper />,
};

export const Closed: Story = {
  args: {
    isOpen: false,
    onOpenChangeAction: () => {},
  },
  render: () => <DialogWrapper initialOpen={false} />,
};
