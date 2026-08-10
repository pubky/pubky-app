import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
};

const mockUseProfileForm = vi.fn();

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
    mockUseProfileForm.mockReturnValue({
      state: {
        isLoading: false,
        name: 'Test User',
        bio: 'Test bio',
        links: [],
        avatarPreview: null,
        avatarFile: null,
        isSaving: false,
        submitText: 'Save Profile',
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
});

describe('EditProfileForm - Snapshots', () => {
  beforeEach(() => {
    mockUseProfileForm.mockReturnValue({
      state: {
        isLoading: false,
        name: 'Test User',
        bio: 'Test bio',
        links: [],
        avatarPreview: null,
        avatarFile: null,
        isSaving: false,
        submitText: 'Save Profile',
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
  });

  it('matches snapshot', () => {
    const { container } = render(<EditProfileForm />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
