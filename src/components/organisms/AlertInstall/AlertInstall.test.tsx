import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from '@/hooks/useInstallPrompt/useInstallPrompt';
import type { UseInstallPromptResult } from '@/hooks/useInstallPrompt/useInstallPrompt.types';
import { AlertInstall } from './AlertInstall';

vi.mock('@/hooks/useInstallPrompt/useInstallPrompt', () => ({
  useInstallPrompt: vi.fn(),
}));

vi.mock('@/organisms/DialogInstallIos/DialogInstallIos', () => ({
  DialogInstallIos: ({
    open,
    onOpenChange,
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="dialog-install-ios" data-open={open}>
      <button type="button" data-testid="dialog-install-ios-close" onClick={() => onOpenChange(false)}>
        close
      </button>
      <button type="button" data-testid="dialog-install-ios-confirm" onClick={onConfirm}>
        confirm
      </button>
    </div>
  ),
}));

function mockPrompt(overrides: Partial<UseInstallPromptResult> = {}): UseInstallPromptResult {
  const value: UseInstallPromptResult = {
    visible: true,
    platform: 'native',
    install: vi.fn().mockResolvedValue(undefined),
    remindLater: vi.fn(),
    iosDialogOpen: false,
    closeIosDialog: vi.fn(),
    ...overrides,
  };
  vi.mocked(useInstallPrompt).mockReturnValue(value);
  return value;
}

describe('AlertInstall', () => {
  beforeEach(() => {
    mockPrompt();
  });

  it('renders the banner with both actions', () => {
    render(<AlertInstall />);

    expect(screen.getByRole('region', { name: 'Install Pubky' })).toBeInTheDocument();
    expect(screen.getByText('Install Pubky for faster access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });

  it('renders nothing when not eligible', () => {
    mockPrompt({ visible: false });
    const { container } = render(<AlertInstall />);
    expect(container).toBeEmptyDOMElement();
  });

  it('snoozes on Later and installs on Install', () => {
    const prompt = mockPrompt();
    render(<AlertInstall />);

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(prompt.remindLater).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt.install).toHaveBeenCalledTimes(1);
  });

  it('opens the iOS steps dialog when the hook asks for it', () => {
    mockPrompt({ platform: 'ios', iosDialogOpen: true });
    render(<AlertInstall />);

    expect(screen.getByTestId('dialog-install-ios')).toHaveAttribute('data-open', 'true');
  });

  it('maps closing the iOS dialog to a snooze and confirming it to a permanent dismissal', () => {
    const prompt = mockPrompt({ platform: 'ios', iosDialogOpen: true });
    render(<AlertInstall />);

    fireEvent.click(screen.getByTestId('dialog-install-ios-close'));
    expect(prompt.closeIosDialog).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByTestId('dialog-install-ios-confirm'));
    expect(prompt.closeIosDialog).toHaveBeenLastCalledWith(true);
  });
});

describe('AlertInstall - Snapshots', () => {
  it('matches snapshot for the native install banner', () => {
    mockPrompt();
    const { container } = render(<AlertInstall />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with the iOS dialog open', () => {
    mockPrompt({ platform: 'ios', iosDialogOpen: true });
    const { container } = render(<AlertInstall />);
    expect(container).toMatchSnapshot();
  });
});
