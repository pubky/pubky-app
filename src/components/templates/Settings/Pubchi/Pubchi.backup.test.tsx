import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PubchiSettings } from './Pubchi';

const WORDS = Array.from({ length: 12 }, (_, index) => `word-${index + 1}`);

vi.mock('@/libs/pubchi/flags', () => ({ isPubchiEnabled: () => true }));
vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    form: { control: {} },
    backupForm: { control: {} },
    submit: vi.fn(),
    confirmBackup: vi.fn(),
    openBackup: vi.fn(),
    closeBackup: vi.fn(),
    remove: vi.fn(),
    revokeDevice: vi.fn(),
    revokeAllDevices: vi.fn(),
    reapprove: vi.fn(),
    needsReapproval: false,
    binding: { bot: 'aihfhgdfshrj8nz9ofo7khayc1mgcqa4wrrdjahs5tmgo4pna3iy' },
    pubchi: {
      bot: 'aihfhgdfshrj8nz9ofo7khayc1mgcqa4wrrdjahs5tmgo4pna3iy',
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    },
    creating: false,
    backupOpen: true,
    backupPositions: [1, 5, 9],
    backupController: { words: () => WORDS },
    devices: [],
    loading: false,
    enabled: true,
  }),
}));
vi.mock('@/molecules/ControlledInputField/ControlledInputField', () => ({
  ControlledInputField: ({ label }: { label: string }) => <input aria-label={label} value="" readOnly />,
}));

describe('Pubchi backup reveal', () => {
  it('renders inert phrase cells and never places a revealed word in an input value', () => {
    const clipboardWrite = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    render(<PubchiSettings />);
    expect(screen.getByTestId('pubchi-backup-reveal')).toHaveClass('select-none', { exact: false });
    expect(screen.getByLabelText('Pubchi recovery words').querySelectorAll('span')).toHaveLength(12);
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveValue('');
    }
    expect(clipboardWrite).not.toHaveBeenCalled();
  });
});
