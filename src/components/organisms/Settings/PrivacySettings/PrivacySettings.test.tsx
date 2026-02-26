import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrivacySettings } from './PrivacySettings';
import { defaultPrivacyPreferences } from '@/core/stores/settings/settings.types';

// Mock settings store
const mockSetShowConfirm = vi.fn();
const mockSetBlurCensored = vi.fn();
const mockSetSignOutInactive = vi.fn();
const mockSetRequirePin = vi.fn();
const mockSetHideWhoToFollow = vi.fn();
const mockSetHideActiveFriends = vi.fn();
const mockSetHideSearch = vi.fn();
const mockSetNeverShowPosts = vi.fn();
const mockUseSettingsStore = vi.fn();

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useSettingsStore: () => mockUseSettingsStore(),
  };
});

describe('PrivacySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSettingsStore.mockReturnValue({
      privacy: defaultPrivacyPreferences,
      setShowConfirm: mockSetShowConfirm,
      setBlurCensored: mockSetBlurCensored,
      setSignOutInactive: mockSetSignOutInactive,
      setRequirePin: mockSetRequirePin,
      setHideWhoToFollow: mockSetHideWhoToFollow,
      setHideActiveFriends: mockSetHideActiveFriends,
      setHideSearch: mockSetHideSearch,
      setNeverShowPosts: mockSetNeverShowPosts,
    });
  });

  it('renders all privacy switches', () => {
    render(<PrivacySettings />);

    expect(screen.getByText('Show confirmation before redirecting')).toBeInTheDocument();
    expect(screen.getByText('Blur censored posts or profile pictures')).toBeInTheDocument();
    expect(screen.getByText('Sign me out when inactive for 5 minutes')).toBeInTheDocument();
    expect(screen.getByText('Require PIN when inactive for 5 minutes')).toBeInTheDocument();
    expect(screen.getByText("Hide your profile in 'Who to Follow'")).toBeInTheDocument();
    expect(screen.getByText("Hide your profile in 'Active Friends'")).toBeInTheDocument();
    expect(screen.getByText('Hide your profile in search results')).toBeInTheDocument();
    expect(screen.getByText("Never show posts from people you don't follow")).toBeInTheDocument();
  });

  it('calls setShowConfirm when toggling confirmation switch', () => {
    const { container } = render(<PrivacySettings />);

    const confirmSwitch = container.querySelector('#show-confirmation-switch');
    fireEvent.click(confirmSwitch!);

    expect(mockSetShowConfirm).toHaveBeenCalledWith(false);
  });

  it('calls setBlurCensored when toggling blur switch', () => {
    const { container } = render(<PrivacySettings />);

    const blurSwitch = container.querySelector('#blur-censored-switch');
    fireEvent.click(blurSwitch!);

    expect(mockSetBlurCensored).toHaveBeenCalledWith(false);
  });

  it('renders switches with correct checked state', () => {
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: false,
        blurCensored: false,
      },
      setShowConfirm: mockSetShowConfirm,
      setBlurCensored: mockSetBlurCensored,
      setSignOutInactive: mockSetSignOutInactive,
      setRequirePin: mockSetRequirePin,
      setHideWhoToFollow: mockSetHideWhoToFollow,
      setHideActiveFriends: mockSetHideActiveFriends,
      setHideSearch: mockSetHideSearch,
      setNeverShowPosts: mockSetNeverShowPosts,
    });

    const { container } = render(<PrivacySettings />);

    const confirmSwitch = container.querySelector('#show-confirmation-switch');
    const blurSwitch = container.querySelector('#blur-censored-switch');

    expect(confirmSwitch).toHaveAttribute('aria-checked', 'false');
    expect(blurSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles from false to true correctly', () => {
    mockUseSettingsStore.mockReturnValue({
      privacy: {
        ...defaultPrivacyPreferences,
        showConfirm: false,
      },
      setShowConfirm: mockSetShowConfirm,
      setBlurCensored: mockSetBlurCensored,
      setSignOutInactive: mockSetSignOutInactive,
      setRequirePin: mockSetRequirePin,
      setHideWhoToFollow: mockSetHideWhoToFollow,
      setHideActiveFriends: mockSetHideActiveFriends,
      setHideSearch: mockSetHideSearch,
      setNeverShowPosts: mockSetNeverShowPosts,
    });

    const { container } = render(<PrivacySettings />);

    const confirmSwitch = container.querySelector('#show-confirmation-switch');
    fireEvent.click(confirmSwitch!);

    expect(mockSetShowConfirm).toHaveBeenCalledWith(true);
  });
});

describe('PrivacySettings - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSettingsStore.mockReturnValue({
      privacy: defaultPrivacyPreferences,
      setShowConfirm: mockSetShowConfirm,
      setBlurCensored: mockSetBlurCensored,
      setSignOutInactive: mockSetSignOutInactive,
      setRequirePin: mockSetRequirePin,
      setHideWhoToFollow: mockSetHideWhoToFollow,
      setHideActiveFriends: mockSetHideActiveFriends,
      setHideSearch: mockSetHideSearch,
      setNeverShowPosts: mockSetNeverShowPosts,
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<PrivacySettings />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
