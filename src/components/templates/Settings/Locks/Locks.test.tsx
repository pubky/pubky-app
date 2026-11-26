import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocksSettingsStatus,
  UseLocksSettingsStatusOptions,
} from '@/hooks/useLocksSettingsStatus/useLocksSettingsStatus.types';
import type { PaidUnlockAvailability } from '@/libs/region/paidUnlockAvailability';
import { Locks } from './Locks';

const mocks = vi.hoisted(() => ({
  status: 'not-set-up' as LocksSettingsStatus,
  recheck: vi.fn(),
  markSetUp: vi.fn(),
  statusOptions: vi.fn(),
  paidUnlocks: { status: 'available' } as PaidUnlockAvailability,
  isMobile: false,
}));

vi.mock('@/hooks/useLocksSettingsStatus/useLocksSettingsStatus', () => ({
  useLocksSettingsStatus: (options: UseLocksSettingsStatusOptions) => {
    mocks.statusOptions(options);
    return { status: mocks.status, recheck: mocks.recheck, markSetUp: mocks.markSetUp };
  },
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

vi.mock('@/hooks/usePaidUnlockAvailability/usePaidUnlockAvailability', () => ({
  usePaidUnlockAvailability: () => mocks.paidUnlocks,
}));

// The real dialog runs the Lock Server and Paykit flows; only how it opens matters here.
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({
  DialogLocksAuth: ({
    open,
    onOpenChange,
    onSuccess,
    startAtHeldCheck,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    startAtHeldCheck?: boolean;
  }) =>
    open ? (
      <div data-testid="dialog-locks-auth" data-start-at-held-check={String(Boolean(startAtHeldCheck))}>
        <button onClick={onSuccess}>{'Finish setup'}</button>
        <button onClick={() => onOpenChange(false)}>{'Close dialog'}</button>
      </div>
    ) : null,
}));

const lastStatusOptions = () => mocks.statusOptions.mock.calls.at(-1)?.[0];

describe('Locks settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'not-set-up';
    mocks.paidUnlocks = { status: 'available' };
    mocks.isMobile = false;
  });

  it('shows a loading state, never "Enable Locks", while the setup is unknown', () => {
    mocks.status = 'loading';
    render(<Locks />);

    expect(screen.getByRole('status', { name: 'Checking your Locks setup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable Locks' })).not.toBeInTheDocument();
  });

  it('opens the Locks setup dialog from "Enable Locks" and shows set up when it finishes, without a recheck', () => {
    render(<Locks />);

    expect(screen.getByText('Enable Locks to earn from your content.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Locks' }));
    expect(screen.getByTestId('dialog-locks-auth')).toHaveAttribute('data-start-at-held-check', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(mocks.markSetUp).toHaveBeenCalledTimes(1);
    expect(mocks.recheck).not.toHaveBeenCalled();
  });

  it('pauses the tab-shown recheck while the dialog is open', () => {
    render(<Locks />);
    expect(lastStatusOptions()).toEqual({ paused: false });

    fireEvent.click(screen.getByRole('button', { name: 'Enable Locks' }));
    expect(lastStatusOptions()).toEqual({ paused: true });

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(lastStatusOptions()).toEqual({ paused: false });
    expect(screen.queryByTestId('dialog-locks-auth')).not.toBeInTheDocument();
  });

  it('disables "Enable Locks" and shows the region notice where paid unlocks are blocked', () => {
    mocks.paidUnlocks = { status: 'blocked', cause: 'region' };
    render(<Locks />);

    expect(screen.getByRole('button', { name: 'Enable Locks' })).toBeDisabled();
    expect(screen.getByText("Paid unlocks aren't available in your region yet.")).toBeInTheDocument();
  });

  it('disables "Enable Locks" without a notice while the region is being checked', () => {
    mocks.paidUnlocks = { status: 'checking' };
    render(<Locks />);

    expect(screen.getByRole('button', { name: 'Enable Locks' })).toBeDisabled();
    expect(screen.queryByTestId('locks-region-notice')).not.toBeInTheDocument();
  });

  it('shows the Locks enabled card once set up', () => {
    mocks.status = 'set-up';
    render(<Locks />);

    expect(
      screen.getByText('You are able to receive payments and earn bitcoin from your content.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Locks enabled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable Locks' })).not.toBeInTheDocument();
  });

  it.each([
    ['not-set-up', 'Enable Locks to earn money from your content.'],
    ['set-up', 'You are able to receive payments and earn money from your content.'],
  ] as const)('uses the mobile wording when %s in the mobile layout', (status, text) => {
    mocks.status = status;
    mocks.isMobile = true;
    render(<Locks />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('offers a retry and a reconnect that starts at Paykit when the Lock Server answers unavailable', () => {
    mocks.status = 'unavailable';
    render(<Locks />);

    expect(screen.getByText('Something went wrong while checking your Bitkit wallet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable Locks' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.recheck).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Bitkit' }));
    expect(screen.getByTestId('dialog-locks-auth')).toHaveAttribute('data-start-at-held-check', 'true');
  });

  it('offers only a retry when the check itself failed', () => {
    mocks.status = 'error';
    render(<Locks />);

    expect(screen.getByText('Something went wrong while checking your Bitkit wallet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect Bitkit' })).not.toBeInTheDocument();
  });
});
