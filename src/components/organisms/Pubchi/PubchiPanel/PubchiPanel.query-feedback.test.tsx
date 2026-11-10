import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiPanel } from '@/organisms/Pubchi/PubchiPanel/PubchiPanel';

const mocks = vi.hoisted(() => ({
  fetchPubchiQuery: vi.fn(),
  toast: vi.fn(),
  signingAvailable: true,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/controllers/pubchi/pubchi')>();
  return {
    ...original,
    PubchiController: {
      ...original.PubchiController,
      consumePrefill: original.PubchiController.consumePrefill,
      fetchPubchiQuery: (...args: unknown[]) => mocks.fetchPubchiQuery(...args),
      loadPubchi: vi.fn().mockResolvedValue({ verified: true }),
      ensureDeviceReady: vi.fn().mockResolvedValue(true),
      reconcileActiveBinding: vi.fn().mockResolvedValue(undefined),
      listDeviceKeys: vi.fn().mockResolvedValue([]),
      loadPubchiConfig: vi.fn().mockResolvedValue(null),
      getCapabilityApprovalUrl: vi.fn(),
      adoptCapabilityApproval: vi.fn(),
    },
  };
});

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: { commitCreate: vi.fn() },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/libs/pubchi/device-key', () => ({
  getCurrentDeviceKey: () => Promise.resolve(mocks.signingAvailable ? {} : undefined),
}));

vi.mock('@/stores/auth/auth.store', () => {
  const state = {
    currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    generation: 'query-feedback-session',
    session: null,
  };
  return {
    useAuthStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

describe('PubchiPanel query validation', () => {
  beforeEach(() => {
    mocks.fetchPubchiQuery.mockReset();
    mocks.toast.mockReset();
    mocks.signingAvailable = true;
  });

  it.each(['', '   '])('rejects a blank question (%j) before sending a request', async (question) => {
    const user = userEvent.setup();
    render(<PubchiPanel open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled());
    if (question) await user.type(screen.getByLabelText('Question'), question);

    await user.click(screen.getByTestId('pubchi-ask'));

    expect(await screen.findByText('Enter a question.')).toBeInTheDocument();
    expect(screen.getByLabelText('Question')).toHaveFocus();
    expect(mocks.fetchPubchiQuery).not.toHaveBeenCalled();
  });
});
