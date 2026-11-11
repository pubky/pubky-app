import { act, renderHook, waitFor } from '@testing-library/react';
import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { FileController } from '@/controllers/file/file';
import { ProfileController } from '@/controllers/profile/profile';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { readSocialMigrationRecord, writeSocialMigrationRecord } from '@/libs/social-migration/record';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useProfileForm } from './useProfileForm';
import { PROFILE_SUBMIT_TEXT } from './useProfileForm.types';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({ push: routerPush, back: vi.fn() }),
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { bootstrapWithDelay: vi.fn() },
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    commitCreate: vi.fn(),
    commitCreateAttachment: vi.fn(),
    getAvatarUrl: vi.fn(),
    toFileAttachment: vi.fn(),
  },
}));

vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: { commitCreate: vi.fn(), commitUpdate: vi.fn() },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: { getState: () => ({ setProfile: vi.fn() }) },
}));

const pubky = 'test-pubky';
const unsafeLink = { label: 'Website', url: 'javascript:alert(1)' };
const SCHEME_MESSAGE = 'Links must start with http:// or https://';

describe('useProfileForm profile link safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks an unsafe link from the create-profile submission path', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    act(() => {
      result.current.handlers.setName('Valid User');
      result.current.handlers.setLinks([unsafeLink]);
      result.current.handlers.validateLinkUrl(unsafeLink.url, 0);
    });

    expect(result.current.errors.linkUrlErrors[0]).toBe(SCHEME_MESSAGE);

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitCreate).not.toHaveBeenCalled();
  });

  // The v1 data model refuses these (SF-5); the field says so before the write instead of a generic toast after it
  it.each([['mailto:test@example.com'], ['tel:+1234567890'], ['HTTPS://Example.com/x']])(
    'refuses the link "%s" on its field, as the data model would at the write',
    async (url) => {
      const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

      act(() => {
        result.current.handlers.setName('Valid User');
        result.current.handlers.setLinks([{ label: 'CONTACT', url }]);
        result.current.handlers.validateLinkUrl(url, 0);
      });

      expect(result.current.errors.linkUrlErrors[0]).toBe(SCHEME_MESSAGE);
      expect(result.current.isSubmitDisabled).toBe(true);

      await act(async () => {
        await result.current.handlers.handleSubmit();
      });

      expect(ProfileController.commitCreate).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    },
  );

  it('blocks a legacy mailto: link the edit form loaded, naming the field, before the write', async () => {
    const userDetails: NexusUserDetails = {
      id: pubky,
      name: 'Valid User',
      bio: '',
      links: [{ title: 'EMAIL', url: 'mailto:test@example.com' }],
      status: null,
      image: null,
      indexed_at: 1,
    };
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    act(() => result.current.handlers.setBio('New bio'));

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(result.current.errors.linkUrlErrors[0]).toBe(SCHEME_MESSAGE);
    expect(ProfileController.commitUpdate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('accepts a bare X handle and saves it as the profile URL (issue #1846)', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    act(() => {
      result.current.handlers.setName('Valid User');
      result.current.handlers.setLinks([
        { label: 'WEBSITE', url: '' },
        { label: 'X (TWITTER)', url: '@jack' },
      ]);
      result.current.handlers.validateLinkUrl('@jack', 1);
    });

    // The placeholder reads `@user`, so the handle must not be reported as an invalid URL.
    expect(result.current.errors.linkUrlErrors[1]).toBeNull();

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          links: expect.arrayContaining([{ label: 'X (TWITTER)', url: 'https://x.com/jack' }]),
        }),
      }),
    );
  });

  it('blocks an unsafe legacy link from the edit-profile submission path', async () => {
    const userDetails: NexusUserDetails = {
      id: pubky,
      name: 'Valid User',
      bio: '',
      links: [{ title: unsafeLink.label, url: unsafeLink.url }],
      status: null,
      image: null,
      indexed_at: 1,
    };
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.handlers.validateLinkUrl(unsafeLink.url, 0);
    });

    expect(result.current.errors.linkUrlErrors[0]).toBe(SCHEME_MESSAGE);

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).not.toHaveBeenCalled();
  });
});

describe('useProfileForm link refusals from the data model', () => {
  const userDetails: NexusUserDetails = {
    id: pubky,
    name: 'Valid User',
    bio: '',
    links: [
      { title: 'WEBSITE', url: 'https://example.com' },
      { title: 'BLOG', url: 'https://blog.example.com' },
    ],
    status: null,
    image: null,
    indexed_at: 1,
  };
  // What `UserNormalizer.to` and `ProfileApplication` throw when `buildUser` refuses a member
  const refusalOf = (field: string) =>
    Err.validation(ValidationErrorCode.INVALID_INPUT, `${field} must be a canonical web URI`, {
      service: ErrorService.SocialSpecs,
      operation: 'buildUser',
      context: { pubky, code: 'reference', field },
    });

  const renderEditForm = async () => {
    const hook = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));
    await waitFor(() => expect(hook.result.current.state.isLoading).toBe(false));
    act(() => hook.result.current.handlers.setBio('New bio'));
    return hook.result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a refusal of links[n].url on that link instead of the generic toast', async () => {
    vi.mocked(ProfileController.commitUpdate).mockRejectedValueOnce(refusalOf('links[1].url'));
    const result = await renderEditForm();

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(result.current.errors.linkUrlErrors).toEqual({ 1: 'Invalid URL' });
    expect(result.current.isSubmitDisabled).toBe(true);
    expect(result.current.state.submitText).toBe(PROFILE_SUBMIT_TEXT.saveProfile);
    expect(toast).not.toHaveBeenCalled();
  });

  it('puts the refusal on the form row the link sits in, not its place among the rows with a URL', async () => {
    vi.mocked(ProfileController.commitCreate).mockRejectedValueOnce(refusalOf('links[0].url'));
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    act(() => {
      result.current.handlers.setName('Valid User');
      // The WEBSITE row is empty, so the model's first link is the X row
      result.current.handlers.setLinks([
        { label: 'WEBSITE', url: '' },
        { label: 'X (TWITTER)', url: 'https://x.com/jack' },
      ]);
    });

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(result.current.errors.linkUrlErrors).toEqual({ 1: 'Invalid URL' });
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps the generic toast for a refusal that names another member', async () => {
    vi.mocked(ProfileController.commitUpdate).mockRejectedValueOnce(refusalOf('links[1].title'));
    const result = await renderEditForm();

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(result.current.errors.linkUrlErrors).toEqual({});
    expect(result.current.state.submitText).toBe(PROFILE_SUBMIT_TEXT.tryAgain);
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not update profile' });
  });
});

describe('useProfileForm reserved name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses the [DELETED] label, which belongs to a tombstoned profile', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    act(() => {
      result.current.handlers.setName('[DELETED]');
    });

    expect(result.current.errors.nameError).toBe('This name is reserved');
    expect(result.current.isSubmitDisabled).toBe(true);

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitCreate).not.toHaveBeenCalled();
  });

  it('still accepts a live name', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    act(() => {
      result.current.handlers.setName('Alice');
    });

    expect(result.current.errors.nameError).toBeNull();
    expect(result.current.isSubmitDisabled).toBe(false);
  });
});

describe('useProfileForm post-save navigation', () => {
  const userDetails: NexusUserDetails = {
    id: pubky,
    name: 'Valid User',
    bio: '',
    links: [],
    status: null,
    image: null,
    indexed_at: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signup write order', () => {
    const avatarFile = new File(['a'], 'avatar.jpg', { type: 'image/jpeg' });
    const media = buildFile(fakeOwner(1), { bytes: new Uint8Array([1]), type: 'image/jpeg' });
    const avatarUri = media.url;
    const avatarAttachment = { media, bytes: new Uint8Array([1]), name: 'avatar.jpg', contentType: 'image/jpeg' };

    const submitSignup = async (withAvatar = true) => {
      const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));
      act(() => {
        result.current.handlers.setName('Valid User');
        if (withAvatar) result.current.handlers.handleCropComplete(avatarFile, 'blob:preview');
      });
      await act(async () => {
        await result.current.handlers.handleSubmit();
      });
      return result;
    };

    beforeEach(() => {
      vi.mocked(FileController.toFileAttachment).mockResolvedValue(avatarAttachment);
    });

    it('puts the first profile, already carrying the image URI, before the avatar bytes', async () => {
      await submitSignup();

      expect(ProfileController.commitCreate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ image: avatarUri, pubky }),
      );
      expect(FileController.commitCreateAttachment).toHaveBeenCalledExactlyOnceWith({
        fileAttachment: avatarAttachment,
      });
      const [hashed] = vi.mocked(FileController.toFileAttachment).mock.invocationCallOrder;
      const [profile] = vi.mocked(ProfileController.commitCreate).mock.invocationCallOrder;
      const [upload] = vi.mocked(FileController.commitCreateAttachment).mock.invocationCallOrder;
      expect(hashed).toBeLessThan(profile);
      expect(profile).toBeLessThan(upload);
      expect(FileController.commitCreate).not.toHaveBeenCalled();
      expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
    });

    it('shows each step as it runs: the profile, then the upload', async () => {
      const profile = Promise.withResolvers<void>();
      const upload = Promise.withResolvers<void>();
      vi.mocked(ProfileController.commitCreate).mockReturnValueOnce(profile.promise);
      vi.mocked(FileController.commitCreateAttachment).mockReturnValueOnce(upload.promise);
      const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));
      act(() => {
        result.current.handlers.setName('Valid User');
        result.current.handlers.handleCropComplete(avatarFile, 'blob:preview');
      });

      act(() => {
        void result.current.handlers.handleSubmit();
      });

      await waitFor(() => expect(result.current.state.submitText).toBe('Saving profile...'));
      await act(async () => profile.resolve());
      await waitFor(() => expect(result.current.state.submitText).toBe('Uploading avatar...'));
      await act(async () => upload.resolve());
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS));
    });

    it('writes the profile alone when no avatar was chosen', async () => {
      await submitSignup(false);

      expect(ProfileController.commitCreate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ image: null, pubky }),
      );
      expect(FileController.toFileAttachment).not.toHaveBeenCalled();
      expect(FileController.commitCreateAttachment).not.toHaveBeenCalled();
    });

    it('writes nothing when the avatar cannot be prepared', async () => {
      vi.mocked(FileController.toFileAttachment).mockRejectedValueOnce(new Error('too large'));

      const result = await submitSignup();

      expect(ProfileController.commitCreate).not.toHaveBeenCalled();
      expect(FileController.commitCreateAttachment).not.toHaveBeenCalled();
      expect(result.current.state.submitText).toBe('Try again!');
    });

    it('offers a retry that writes both again in order when the upload fails', async () => {
      vi.mocked(FileController.commitCreateAttachment).mockRejectedValueOnce(new Error('offline'));

      const result = await submitSignup();

      expect(result.current.state.submitText).toBe('Try again!');
      expect(routerPush).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.handlers.handleSubmit();
      });

      expect(ProfileController.commitCreate).toHaveBeenCalledTimes(2);
      expect(FileController.commitCreateAttachment).toHaveBeenCalledTimes(2);
      const profiles = vi.mocked(ProfileController.commitCreate).mock.invocationCallOrder;
      const uploads = vi.mocked(FileController.commitCreateAttachment).mock.invocationCallOrder;
      expect(profiles[1]).toBeLessThan(uploads[1]);
      expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
    });
  });

  it('redirects to the onboarding tags step after a successful create', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));

    expect(result.current.state.submitText).toBe('Continue');

    act(() => {
      result.current.handlers.setName('Valid User');
    });

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitCreate).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
  });

  it('redirects to the own profile page after a successful edit by default', async () => {
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.submitText).toBe('Save Profile');

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(PROFILE_ROUTES.PROFILE);
  });

  it('continues without saving or showing a toast on a pristine onboarding profile revisit', async () => {
    const { result } = renderHook(() =>
      useProfileForm({ mode: 'edit', pubky, userDetails, redirectTo: ONBOARDING_ROUTES.TAGS }),
    );

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.submitText).toBe('Continue');

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).not.toHaveBeenCalled();
    expect(ProfileController.commitCreate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
  });

  it('saves a dirty onboarding profile revisit before continuing', async () => {
    const { result } = renderHook(() =>
      useProfileForm({ mode: 'edit', pubky, userDetails, redirectTo: ONBOARDING_ROUTES.TAGS }),
    );

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    act(() => {
      result.current.handlers.setBio('Updated bio');
    });

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.TAGS);
  });
});

describe('useProfileForm edit sends only the fields the user changed', () => {
  // The cached profile may be stale, so nothing is taken from it unless the user edits it.
  const userDetails: NexusUserDetails = {
    id: pubky,
    name: 'Valid User',
    bio: 'Cached bio',
    links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
    status: 'working',
    image: 'pubky://test-pubky/pub/pubky.app/files/OLD',
    indexed_at: 1,
  };

  const renderEditForm = async () => {
    const hook = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));
    await waitFor(() => expect(hook.result.current.state.isLoading).toBe(false));
    return hook.result;
  };

  const submit = async (result: Awaited<ReturnType<typeof renderEditForm>>) => {
    await act(async () => {
      await result.current.handlers.handleSubmit();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends no image when the avatar is untouched', async () => {
    const result = await renderEditForm();

    await submit(result);

    expect(ProfileController.commitUpdate).toHaveBeenCalledWith({ pubky, changes: {} });
  });

  it('sends only the edited bio', async () => {
    const result = await renderEditForm();
    act(() => {
      result.current.handlers.setBio('New bio');
    });

    await submit(result);

    expect(ProfileController.commitUpdate).toHaveBeenCalledWith({ pubky, changes: { bio: 'New bio' } });
  });

  it('ignores a whitespace-only name edit', async () => {
    const result = await renderEditForm();
    act(() => {
      result.current.handlers.setName('Valid User  ');
    });

    await submit(result);

    expect(ProfileController.commitUpdate).toHaveBeenCalledWith({ pubky, changes: {} });
  });

  it('sends image: null when the avatar is removed', async () => {
    const result = await renderEditForm();
    act(() => {
      result.current.handlers.handleDeleteAvatar();
    });

    await submit(result);

    expect(ProfileController.commitUpdate).toHaveBeenCalledWith({ pubky, changes: { image: null } });
  });

  it('sends the uploaded avatar when a new one is chosen', async () => {
    const uploaded = 'pubky://test-pubky/pub/pubky.app/files/NEW';
    vi.mocked(FileController.commitCreate).mockResolvedValue(uploaded);
    const result = await renderEditForm();
    act(() => {
      result.current.handlers.handleCropComplete(new File(['a'], 'avatar.jpg', { type: 'image/jpeg' }), 'blob:preview');
    });

    await submit(result);

    expect(ProfileController.commitUpdate).toHaveBeenCalledWith({ pubky, changes: { image: uploaded } });
    // An existing user's files are indexed either way: the edit path uploads first, as it always did.
    expect(vi.mocked(FileController.commitCreate).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ProfileController.commitUpdate).mock.invocationCallOrder[0],
    );
  });

  it('sends an empty link list when every link is removed', async () => {
    const result = await renderEditForm();
    act(() => {
      result.current.handlers.handleDeleteLink(0);
    });

    await submit(result);

    expect(ProfileController.commitUpdate).toHaveBeenCalledWith({ pubky, changes: { links: [] } });
  });
});

describe('useProfileForm effective link changes', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { label: 'removing an empty placeholder', original: [], edited: [{ label: 'WEBSITE', url: '' }], expected: {} },
    {
      label: 'whitespace in an empty placeholder',
      original: [],
      edited: [{ label: 'WEBSITE', url: '  ' }],
      expected: {},
    },
    {
      label: 'whitespace around a real URL',
      original: [{ title: 'Website', url: 'https://example.com/' }],
      edited: [{ label: 'WEBSITE', url: ' https://example.com/ ' }],
      expected: {},
    },
    {
      label: 'equivalent X handle',
      original: [{ title: 'X (TWITTER)', url: 'https://x.com/alice' }],
      edited: [{ label: 'X (TWITTER)', url: '@alice' }],
      expected: {},
    },
    {
      label: 'repairing a stored bare X handle',
      original: [{ title: 'X (TWITTER)', url: '@alice' }],
      edited: [{ label: 'X (TWITTER)', url: 'https://x.com/alice' }],
      expected: { links: [{ label: 'X (TWITTER)', url: 'https://x.com/alice' }] },
    },
    {
      label: 'removing an unsafe legacy link',
      original: [{ title: 'Website', url: 'javascript:alert(1)' }],
      edited: [],
      expected: { links: [] },
    },
    {
      label: 'removing a stored blank link',
      original: [{ title: 'Website', url: ' ' }],
      edited: [],
      expected: { links: [] },
    },
    {
      label: 'leaving a stored blank link untouched',
      original: [{ title: 'Website', url: ' ' }],
      edited: [{ label: 'WEBSITE', url: ' ' }],
      expected: {},
    },
    {
      label: 'editing a real URL',
      original: [{ title: 'Website', url: 'https://example.com/' }],
      edited: [{ label: 'WEBSITE', url: 'https://example.com/new' }],
      expected: { links: [{ label: 'WEBSITE', url: 'https://example.com/new' }] },
    },
    {
      label: 'editing a label',
      original: [{ title: 'Website', url: 'https://example.com/' }],
      edited: [{ label: 'BLOG', url: 'https://example.com/' }],
      expected: { links: [{ label: 'BLOG', url: 'https://example.com/' }] },
    },
  ])('handles $label without republishing unrelated cached links', async ({ original, edited, expected }) => {
    const userDetails: NexusUserDetails = {
      id: pubky,
      name: 'Valid User',
      bio: '',
      links: original,
      image: null,
      status: null,
      indexed_at: 1,
    };
    const { result } = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    act(() => {
      result.current.handlers.setLinks(edited);
      result.current.handlers.setBio('New bio');
    });
    await act(async () => {
      await result.current.handlers.handleSubmit();
    });
    expect(ProfileController.commitUpdate).toHaveBeenCalledExactlyOnceWith({
      pubky,
      changes: { bio: 'New bio', ...expected },
    });
  });
});

describe('useProfileForm account update notice', () => {
  const userDetails: NexusUserDetails = {
    id: pubky,
    name: 'Valid User',
    bio: '',
    links: [],
    status: null,
    image: null,
    indexed_at: 1,
  };

  const writeNotice = (notice: { profileImage: number; profileLinks: number; pending: boolean }) =>
    writeSocialMigrationRecord(pubky, {
      v: 1,
      migratedRev: 1,
      admittedGrantIds: [],
      notice: { skipped: {}, ...notice },
    });

  const renderEditForm = async () => {
    const hook = renderHook(() => useProfileForm({ mode: 'edit', pubky, userDetails }));
    await waitFor(() => expect(hook.result.current.state.isLoading).toBe(false));
    return hook.result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('exposes the profile values the account update dropped while the notice is pending', async () => {
    writeNotice({ profileImage: 1, profileLinks: 2, pending: true });
    const result = await renderEditForm();
    expect(result.current.state.migrationNotice).toEqual({ profileImage: 1, profileLinks: 2 });
  });

  it('exposes nothing without a record, after an acknowledged notice, or on the create form', async () => {
    expect((await renderEditForm()).current.state.migrationNotice).toBeNull();

    writeNotice({ profileImage: 1, profileLinks: 0, pending: false });
    expect((await renderEditForm()).current.state.migrationNotice).toBeNull();

    writeNotice({ profileImage: 1, profileLinks: 0, pending: true });
    const { result } = renderHook(() => useProfileForm({ mode: 'create', pubky, setShowWelcomeDialog: vi.fn() }));
    expect(result.current.state.migrationNotice).toBeNull();
    expect(readSocialMigrationRecord(pubky)?.notice?.pending).toBe(true);
  });

  it('clears the notice for good when dismissed', async () => {
    writeNotice({ profileImage: 0, profileLinks: 1, pending: true });
    const result = await renderEditForm();

    act(() => result.current.handlers.handleDismissMigrationNotice());

    expect(result.current.state.migrationNotice).toBeNull();
    expect(readSocialMigrationRecord(pubky)?.notice).toEqual({
      skipped: {},
      profileImage: 0,
      profileLinks: 1,
      pending: false,
    });
    expect((await renderEditForm()).current.state.migrationNotice).toBeNull();
  });

  it('clears the notice on the next successful save', async () => {
    writeNotice({ profileImage: 1, profileLinks: 0, pending: true });
    const result = await renderEditForm();
    act(() => result.current.handlers.setBio('New bio'));

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).toHaveBeenCalledOnce();
    expect(result.current.state.migrationNotice).toBeNull();
    expect(readSocialMigrationRecord(pubky)?.notice?.pending).toBe(false);
  });

  it('leaves the notice to the settings page on the onboarding revisit', async () => {
    writeNotice({ profileImage: 1, profileLinks: 0, pending: true });
    const { result } = renderHook(() =>
      useProfileForm({ mode: 'edit', pubky, userDetails, redirectTo: ONBOARDING_ROUTES.TAGS }),
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.migrationNotice).toBeNull();
    act(() => result.current.handlers.setBio('New bio'));

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(ProfileController.commitUpdate).toHaveBeenCalledOnce();
    expect(readSocialMigrationRecord(pubky)?.notice?.pending).toBe(true);
  });

  it('keeps the notice when the save fails', async () => {
    writeNotice({ profileImage: 1, profileLinks: 0, pending: true });
    vi.mocked(ProfileController.commitUpdate).mockRejectedValueOnce(new Error('offline'));
    const result = await renderEditForm();
    act(() => result.current.handlers.setBio('New bio'));

    await act(async () => {
      await result.current.handlers.handleSubmit();
    });

    expect(result.current.state.migrationNotice).toEqual({ profileImage: 1, profileLinks: 0 });
    expect(readSocialMigrationRecord(pubky)?.notice?.pending).toBe(true);
  });
});

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({ useRequireAuth: () => ({ waitForAuth: async () => true }) }));
