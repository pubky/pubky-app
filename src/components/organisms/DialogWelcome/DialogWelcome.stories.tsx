import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';

/**
 * DialogWelcome Story
 *
 * Since DialogWelcome is self-contained and manages its own state via stores,
 * we create a presentational version for Storybook that accepts props.
 */

interface DialogWelcomeStoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  userBio: string;
  displayPublicKey: string;
  avatarUrl?: string;
}

function DialogWelcomeStory({
  open,
  onOpenChange,
  userName,
  userBio,
  displayPublicKey,
  avatarUrl,
}: DialogWelcomeStoryProps) {
  return (
    <Atoms.Dialog open={open} onOpenChange={onOpenChange}>
      <Atoms.DialogContent className="w-full sm:w-xl" hiddenTitle="Welcome to Pubky!">
        <Atoms.DialogHeader className="gap-0 pr-6 text-left">
          <Atoms.DialogTitle id="welcome-title">Welcome to Pubky!</Atoms.DialogTitle>
          <Atoms.DialogDescription className="font-medium">
            Your keys, your content, your rules.
          </Atoms.DialogDescription>
        </Atoms.DialogHeader>
        <Atoms.Container className="max-h-[420px] overflow-y-auto">
          <Atoms.Container className="flex flex-col gap-6">
            <Atoms.Card className="flex flex-col items-center justify-center gap-6 self-stretch overflow-hidden rounded-lg bg-card p-6 sm:flex-row sm:items-start sm:justify-start">
              <Organisms.AvatarWithFallback
                avatarUrl={avatarUrl}
                name={userName}
                className="h-24 w-24"
                fallbackClassName="text-4xl"
              />
              <Atoms.Container className="flex flex-col items-center justify-center sm:items-start sm:justify-start">
                <Atoms.Typography size="lg">{userName}</Atoms.Typography>
                <Atoms.Typography size="sm" className="text-center font-medium text-muted-foreground sm:text-left">
                  {userBio}
                </Atoms.Typography>
                <Atoms.Button variant="secondary" className="mt-2 h-8 w-fit gap-2 rounded-full" onClick={fn()}>
                  <Libs.Key className="h-4 w-4" />
                  {displayPublicKey}
                </Atoms.Button>
              </Atoms.Container>
            </Atoms.Card>
            <Atoms.Button id="welcome-explore-pubky-btn" className="w-auto" size="lg" onClick={fn()}>
              <Libs.ArrowRight className="mr-2 h-4 w-4" />
              Explore Pubky
            </Atoms.Button>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}

const meta = {
  title: 'Organisms/DialogWelcome',
  component: DialogWelcomeStory,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    open: { control: 'boolean' },
    onOpenChange: { action: 'openChange' },
    userName: { control: 'text' },
    userBio: { control: 'text' },
    displayPublicKey: { control: 'text' },
    avatarUrl: { control: 'text' },
  },
  args: {
    open: true,
    onOpenChange: fn(),
    userName: 'Satoshi Nakamoto',
    userBio: 'Chancellor on brink of second bailout for banks.',
    displayPublicKey: 'pk1abc...xyz9',
    avatarUrl: '',
  },
} satisfies Meta<typeof DialogWelcomeStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithAvatar: Story = {
  args: {
    avatarUrl: '/images/shield.webp',
  },
};

export const LongUserName: Story = {
  args: {
    userName: 'A Very Long Username That Might Overflow The Container',
    userBio: 'Short bio',
  },
};

export const LongBio: Story = {
  args: {
    userName: 'Test User',
    userBio:
      'This is a very long bio that spans multiple lines to test how the dialog handles lengthy content. It should wrap properly and not break the layout.',
  },
};
