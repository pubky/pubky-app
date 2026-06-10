import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditProfileHeader } from './EditProfileHeader';

const mockCopyToClipboard = vi.fn();

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => ({
    currentUserPubky: 'abc123def456ghi789',
  }),
}));

vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    copyToClipboard: mockCopyToClipboard,
  }),
}));

vi.mock('@/molecules/Page/Page', () => {
  return {
    PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
      <h1 data-testid="page-title" data-size={size}>
        {children}
      </h1>
    ),
  };
});

vi.mock('@/molecules/PopoverPublicKey/PopoverPublicKey', () => {
  return {
    PopoverPublicKey: ({ className }: { className?: string }) => (
      <div data-testid="popover-public-key" className={className} />
    ),
  };
});

describe('EditProfileHeader', () => {
  it('renders without crashing', () => {
    const { container } = render(<EditProfileHeader />);
    expect(container).toBeTruthy();
  });

  it('renders the page title', () => {
    render(<EditProfileHeader />);
    expect(screen.getByTestId('page-title')).toBeInTheDocument();
  });

  it('renders the formatted public key button', () => {
    render(<EditProfileHeader />);
    // formatPublicKey with length 8: first 4 + ... + last 4
    expect(screen.getByText(/abc1\.\.\.i789/)).toBeInTheDocument();
  });

  it('copies public key to clipboard on button click', () => {
    render(<EditProfileHeader />);
    const keyButton = screen.getByText(/abc1\.\.\.i789/).closest('button');
    fireEvent.click(keyButton!);
    expect(mockCopyToClipboard).toHaveBeenCalled();
  });

  it('renders the public key popover', () => {
    render(<EditProfileHeader />);
    expect(screen.getByTestId('popover-public-key')).toBeInTheDocument();
  });
});

describe('EditProfileHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<EditProfileHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
