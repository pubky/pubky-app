import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiSettings } from './Pubchi';

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  create: vi.fn(),
  devices: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    reconcileActiveBinding: (...args: unknown[]) => mocks.reconcile(...args),
    loadPubchi: vi.fn().mockResolvedValue(undefined),
    createPubchi: (...args: unknown[]) => mocks.create(...args),
    commitDeleteBinding: vi.fn(),
    listDeviceKeys: (...args: unknown[]) => mocks.devices(...args),
    revokeDevice: vi.fn(),
    revokeAllDevices: vi.fn(),
    getCapabilityApprovalUrl: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (
    selector: (state: { currentUserPubky: string; session: { info: { capabilities: string[] } } }) => unknown,
  ) =>
    selector({
      currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      session: { info: { capabilities: ['/pub/app.pubchi/v1/:rw'] } },
    }),
}));

describe('PubchiSettings enroll validation', () => {
  beforeEach(() => {
    mocks.reconcile.mockReset().mockResolvedValue(undefined);
    mocks.create.mockReset();
    mocks.devices.mockReset().mockResolvedValue([]);
    mocks.toast.mockReset();
  });

  it('shows the field error when Create is clicked with an empty name', async () => {
    const user = userEvent.setup();
    render(<PubchiSettings />);
    await waitFor(() => expect(screen.getByTestId('pubchi-create')).toBeInTheDocument());

    await user.clear(screen.getByLabelText('Name'));
    await user.click(screen.getByTestId('pubchi-create'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name.');
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
