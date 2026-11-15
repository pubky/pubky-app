import type { Session } from '@synonymdev/pubky';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { APP_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { RingApprovalDialog } from './RingApprovalDialog';

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    getCapabilityApprovalUrl: vi.fn(),
  },
}));
vi.mock('@/molecules/Toaster/toast');

describe('RingApprovalDialog', () => {
  beforeEach(() => {
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockReset();
    vi.mocked(toast).mockClear();
    useAuthStore.setState({ currentUserPubky: null, session: null });
  });

  it('renders the Pubchi capabilities QR and completes approval', async () => {
    let resolveApproval!: (session: Session) => void;
    const approval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=pubchi',
      awaitApproval: approval,
      cancelAuthFlow: vi.fn(),
    });
    const onApproved = vi.fn();

    render(<RingApprovalDialog open onOpenChange={vi.fn()} onApproved={onApproved} />);

    await waitFor(() => {
      expect(screen.getAllByRole('img')[0]).toBeInTheDocument();
      for (const capability of APP_SIGNIN_CAPABILITIES.split(',')) {
        expect(screen.getByText(capability)).toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: 'Authorize with Pubky Ring' })).toHaveAttribute(
        'href',
        'pubkyauth://approve?token=pubchi',
      );
    });

    const session = asOpaque<Session>({ pubky: 'owner' });
    resolveApproval(session);
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(session));
  });

  it('completes with the current session when capabilities are already granted', async () => {
    const session = asOpaque<Session>({ pubky: 'owner' });
    useAuthStore.setState({ session });
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue(null);
    const onApproved = vi.fn();
    const onOpenChange = vi.fn();

    render(<RingApprovalDialog open onOpenChange={onOpenChange} onApproved={onApproved} />);

    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(session));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('link', { name: 'Authorize with Pubky Ring' })).not.toBeInTheDocument();
  });

  it('displays and encodes caller-provided capabilities', async () => {
    const capabilities = '/pub/example.app/:rw';
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=custom',
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: vi.fn(),
    });

    render(<RingApprovalDialog open onOpenChange={vi.fn()} onApproved={vi.fn()} capabilities={capabilities} />);

    await waitFor(() => expect(screen.getByText(capabilities)).toBeInTheDocument());
    expect(PubchiController.getCapabilityApprovalUrl).toHaveBeenCalledWith(capabilities);
  });

  it('ignores approval after the dialog closes', async () => {
    let resolveApproval!: (session: Session) => void;
    const approval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=close',
      awaitApproval: approval,
      cancelAuthFlow: vi.fn(),
    });
    const onApproved = vi.fn().mockRejectedValue(new Error('adoption failed'));
    const onOpenChange = vi.fn();
    const { rerender } = render(<RingApprovalDialog open onOpenChange={onOpenChange} onApproved={onApproved} />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Authorize with Pubky Ring' })).toBeInTheDocument());
    rerender(<RingApprovalDialog open={false} onOpenChange={onOpenChange} onApproved={onApproved} />);
    resolveApproval(asOpaque<Session>({ pubky: 'owner' }));

    await waitFor(() => expect(onApproved).not.toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByText(/Could not apply the Ring approval/)).not.toBeInTheDocument();
  });

  it('keeps the flow when callback identities change and uses the latest approval callback', async () => {
    let resolveApproval!: (session: Session) => void;
    const approval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });
    const cancelAuthFlow = vi.fn();
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=stable',
      awaitApproval: approval,
      cancelAuthFlow,
    });
    const firstOnApproved = vi.fn();
    const latestOnApproved = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(<RingApprovalDialog open onOpenChange={onOpenChange} onApproved={firstOnApproved} />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Authorize with Pubky Ring' })).toBeInTheDocument());
    rerender(<RingApprovalDialog open onOpenChange={onOpenChange} onApproved={latestOnApproved} />);

    expect(PubchiController.getCapabilityApprovalUrl).toHaveBeenCalledTimes(1);
    expect(cancelAuthFlow).not.toHaveBeenCalled();

    resolveApproval(asOpaque<Session>({ pubky: 'owner' }));
    await waitFor(() => expect(latestOnApproved).toHaveBeenCalled());
    expect(firstOnApproved).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      variant: 'default',
      title: 'Ring approval applied',
      dismissButton: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancels the active flow when explicitly cancelled', async () => {
    const cancelAuthFlow = vi.fn();
    let resolveApproval!: (session: Session) => void;
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=cancel',
      awaitApproval: new Promise<Session>((resolve) => {
        resolveApproval = resolve;
      }),
      cancelAuthFlow,
    });
    const onApproved = vi.fn();
    const onOpenChange = vi.fn();
    render(<RingApprovalDialog open onOpenChange={onOpenChange} onApproved={onApproved} />);

    await waitFor(() => expect(screen.getByTestId('pubchi-reapprove-cancel')).toBeInTheDocument());
    screen.getByTestId('pubchi-reapprove-cancel').click();
    resolveApproval(asOpaque<Session>({ pubky: 'owner' }));

    expect(cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(onApproved).not.toHaveBeenCalled());
  });

  it('keeps the dialog open and shows adoption errors', async () => {
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=error',
      awaitApproval: Promise.resolve(asOpaque<Session>({ pubky: 'owner' })),
      cancelAuthFlow: vi.fn(),
    });
    const onOpenChange = vi.fn();
    render(
      <RingApprovalDialog
        open
        onOpenChange={onOpenChange}
        onApproved={vi.fn().mockRejectedValue(new Error('adoption failed'))}
      />,
    );

    expect(await screen.findByText(/Could not apply the Ring approval/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({
      variant: 'error',
      title: 'Could not apply Ring approval',
      dismissButton: true,
    });
  });

  it('shows timeout copy when Ring approval expires', async () => {
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=expired',
      awaitApproval: Promise.reject(new Error('timeout')),
      cancelAuthFlow: vi.fn(),
    });

    render(<RingApprovalDialog open onOpenChange={vi.fn()} onApproved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Ring request timed out/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate a new request/i })).toBeInTheDocument();
    });
  });
});
