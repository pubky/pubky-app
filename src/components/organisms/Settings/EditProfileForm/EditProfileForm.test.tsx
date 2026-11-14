import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
import { EditProfileForm } from './EditProfileForm';

const mockHandlers = {
  setName: vi.fn(),
  setBio: vi.fn(),
  setLinks: vi.fn(),
  validateLinkUrl: vi.fn(),
  handleDeleteLink: vi.fn(),
  handleChooseFileClick: vi.fn(),
  handleFileChange: vi.fn(),
  handleDeleteAvatar: vi.fn(),
  handleCropCancel: vi.fn(),
  handleCropBack: vi.fn(),
  handleCropComplete: vi.fn(),
  handleCancel: vi.fn(),
  handleSubmit: vi.fn(),
  handleDismissMigrationNotice: vi.fn(),
};

const mockUseProfileForm = vi.fn();

const profileFormReturn = (migrationNotice: { profileImage: number; profileLinks: number } | null = null) => ({
  state: {
    isLoading: false,
    name: 'Test User',
    bio: 'Test bio',
    links: [],
    avatarPreview: null,
    avatarFile: null,
    isSaving: false,
    submitText: 'Save Profile',
    migrationNotice,
  },
  errors: {
    nameError: null,
    bioError: null,
    linkUrlErrors: [],
    avatarError: null,
  },
  handlers: mockHandlers,
  cropDialog: {
    cropDialogOpen: false,
    pendingAvatarPreview: null,
    pendingAvatarFile: null,
  },
  fileInputRef: { current: null },
  isSubmitDisabled: false,
});

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => ({
    userDetails: { name: 'Test User', bio: 'Test bio' },
    currentUserPubky: 'test-pubky-123',
  }),
}));

vi.mock('@/hooks/useProfileForm/useProfileForm', () => ({
  useProfileForm: (...args: unknown[]) => mockUseProfileForm(...args),
}));

vi.mock('@/organisms/DialogAddLink/DialogAddLink', () => {
  return {
    DialogAddLink: () => <div data-testid="dialog-add-link" />,
  };
});

vi.mock('@/organisms/DialogCropImage/DialogCropImage', () => {
  return {
    DialogCropImage: () => <div data-testid="dialog-crop-image" />,
  };
});

vi.mock('@/config/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/user')>();
  return {
    ...actual,
    USER_MAX_LINKS: 5,
  };
});

describe('EditProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      ...authInitialState,
      hasHydrated: true,
      currentUserPubky: 'test-pubky-123',
      session: mockSession(),
      restoreStatus: 'ready',
    });
    mockUseProfileForm.mockReturnValue(profileFormReturn());
  });

  it('renders without crashing', () => {
    const { container } = render(<EditProfileForm />);
    expect(container).toBeTruthy();
  });

  it('renders the form with name and bio fields', () => {
    render(<EditProfileForm />);
    expect(screen.getByTestId('edit-profile-form')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    mockUseProfileForm.mockReturnValue({
      state: { isLoading: true },
      errors: {},
      handlers: mockHandlers,
      cropDialog: {},
      fileInputRef: { current: null },
      isSubmitDisabled: true,
    });

    render(<EditProfileForm />);
    expect(screen.queryByTestId('edit-profile-form')).not.toBeInTheDocument();
  });

  it('renders cancel and save buttons', () => {
    render(<EditProfileForm />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByTestId('save-profile-button')).toBeInTheDocument();
  });

  it('renders avatar section', () => {
    render(<EditProfileForm />);
    expect(screen.getByText('Avatar')).toBeInTheDocument();
  });

  it('delegates saving to the profile hook, which waits for authentication', () => {
    render(<EditProfileForm />);
    act(() => useAuthStore.setState({ session: null, restoreStatus: 'restoring' }));
    fireEvent.click(screen.getByTestId('save-profile-button'));
    expect(mockHandlers.handleSubmit).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
    expect(screen.getByTestId('edit-profile-form')).toBeInTheDocument();
  });

  describe('account update notice', () => {
    const PICTURE = 'Your profile picture could not be carried over by the account update. Set it again.';
    const ONE_LINK = 'One of your profile links could not be carried over. Check your links.';
    const SOME_LINKS = 'Some of your profile links could not be carried over. Check your links.';

    const withNotice = (migrationNotice: { profileImage: number; profileLinks: number }) =>
      mockUseProfileForm.mockReturnValue(profileFormReturn(migrationNotice));

    it('renders nothing without a pending notice', () => {
      render(<EditProfileForm />);
      expect(screen.queryByTestId('edit-profile-migration-notice')).not.toBeInTheDocument();
    });

    it('names only the dropped profile picture', () => {
      withNotice({ profileImage: 1, profileLinks: 0 });
      render(<EditProfileForm />);
      expect(screen.getByRole('status')).toHaveTextContent(PICTURE);
      expect(screen.queryByText(ONE_LINK)).not.toBeInTheDocument();
      expect(screen.queryByText(SOME_LINKS)).not.toBeInTheDocument();
    });

    it('names one dropped link', () => {
      withNotice({ profileImage: 0, profileLinks: 1 });
      render(<EditProfileForm />);
      expect(screen.getByText(ONE_LINK)).toBeInTheDocument();
      expect(screen.queryByText(PICTURE)).not.toBeInTheDocument();
    });

    it('names the picture and several dropped links together', () => {
      withNotice({ profileImage: 1, profileLinks: 3 });
      render(<EditProfileForm />);
      expect(screen.getByText(PICTURE)).toBeInTheDocument();
      expect(screen.getByText(SOME_LINKS)).toBeInTheDocument();
      expect(screen.queryByText(ONE_LINK)).not.toBeInTheDocument();
    });

    it('dismisses through the profile hook', () => {
      withNotice({ profileImage: 1, profileLinks: 0 });
      render(<EditProfileForm />);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(mockHandlers.handleDismissMigrationNotice).toHaveBeenCalledOnce();
    });
  });
});
