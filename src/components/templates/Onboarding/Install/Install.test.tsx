import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { Install } from './Install';

const mockSearchParamsGet = vi.fn<(key: string) => string | null>(() => null);
const mockToast = vi.fn();
const mockSetInviteCode = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

vi.mock('@/core', () => ({
  useOnboardingStore: {
    getState: () => ({
      setInviteCode: mockSetInviteCode,
    }),
  },
}));

vi.mock('@/molecules', () => ({
  OnboardingLayout: ({ children }: { children: ReactNode }) => <div data-testid="install-layout">{children}</div>,
  InstallNavigation: () => <div data-testid="install-navigation">Install Navigation</div>,
  InstallHeader: () => <div data-testid="install-header">Install Header</div>,
  InstallCard: () => <div data-testid="install-card">Install Card</div>,
  InstallFooter: () => <div data-testid="install-footer">Install Footer</div>,
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe('Install template', () => {
  beforeEach(() => {
    mockSearchParamsGet.mockReset();
    mockSearchParamsGet.mockReturnValue(null);
    mockToast.mockClear();
    mockSetInviteCode.mockClear();
  });

  it('renders install onboarding content', () => {
    render(<Install />);

    expect(screen.getByTestId('install-layout')).toBeInTheDocument();
    expect(screen.getByTestId('install-header')).toBeInTheDocument();
    expect(screen.getByTestId('install-card')).toBeInTheDocument();
    expect(screen.getByTestId('install-footer')).toBeInTheDocument();
  });

  it('applies invite code from URL and shows toast', () => {
    mockSearchParamsGet.mockReturnValueOnce('YVB2-YFRN-GDY0');
    render(<Install />);

    expect(mockSetInviteCode).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Invite code applied',
      description: 'Your invite code YVB2-YFRN-GDY0 has been applied.',
    });
  });

  it('does not set invite code when URL param is missing', () => {
    render(<Install />);

    expect(mockSetInviteCode).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe('Install template - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Install />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
