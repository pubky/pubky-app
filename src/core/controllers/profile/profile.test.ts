import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserResult } from 'pubky-app-specs';
import type { Pubky } from '@/core/models/models.types';

const mockProfileApplication = {
  commitCreate: vi.fn(),
  commitDelete: vi.fn(),
  downloadData: vi.fn(),
  commitUpdateStatus: vi.fn(),
  commitUpdate: vi.fn(),
};

const mockUserNormalizer = {
  to: vi.fn(),
  linksFromUi: vi.fn((links) =>
    (links ?? []).map((link: { label: string; url: string }) => ({ title: link.label, url: link.url })),
  ),
};

const mockOnboardingStore = {
  getState: vi.fn(() => ({
    setSecrets: vi.fn(),
    selectSecretKey: vi.fn(() => 'test-secret-key'),
  })),
};

const mockAuthStore = {
  getState: vi.fn(() => ({
    setCurrentUserPubky: vi.fn(),
  })),
};

const mockIdentity = {
  generateSecrets: vi.fn(() => ({
    secretKey: 'test-secret-key',
    mnemonic: 'test mnemonic phrase',
  })),
  z32FromSecret: vi.fn(() => 'test-pubky'),
  keypairFromSecretKey: vi.fn(() => ({ keypair: 'test-keypair' })),
  createRecoveryFile: vi.fn(),
};

vi.mock('@/core', async () => {
  const actual = await vi.importActual('@/core');
  return {
    ...actual,
    ProfileApplication: mockProfileApplication,
    UserNormalizer: mockUserNormalizer,
    useOnboardingStore: mockOnboardingStore,
    useAuthStore: mockAuthStore,
  };
});

vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Identity: mockIdentity,
  };
});
const testPubky = 'o4dksfbqk85ogzdb5osziw6befigbuxmuxkuxq8434q89uj56uyy' as Pubky;

let ProfileController: typeof import('./profile').ProfileController;

describe('ProfileController', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    mockProfileApplication.commitCreate.mockReset();
    mockProfileApplication.commitDelete.mockReset();
    mockProfileApplication.downloadData.mockReset();
    mockProfileApplication.commitUpdateStatus.mockReset();
    mockProfileApplication.commitUpdate.mockReset();
    mockUserNormalizer.to.mockReset();
    mockIdentity.generateSecrets.mockReset();
    mockIdentity.z32FromSecret.mockReset();
    mockIdentity.keypairFromSecretKey.mockReset();
    mockIdentity.createRecoveryFile.mockReset();
    mockOnboardingStore.getState.mockReturnValue({
      setSecrets: vi.fn(),
      selectSecretKey: vi.fn(() => 'test-secret-key'),
    });
    mockAuthStore.getState.mockReturnValue({
      setCurrentUserPubky: vi.fn(),
    });

    ({ ProfileController } = await import('./profile'));
  });

  describe('commitCreate', () => {
    it('normalizes profile data and delegates to application layer', async () => {
      const profile = {
        name: 'Test User',
        bio: 'Short bio',
        links: [{ label: 'Docs', url: 'https://example.com' }],
      };
      const userResult = {
        user: { toJson: vi.fn() },
        meta: { url: 'user-url' },
      };

      mockUserNormalizer.to.mockReturnValue(userResult as unknown as UserResult);
      mockProfileApplication.commitCreate.mockResolvedValue(undefined);

      await ProfileController.commitCreate({
        profile: profile as { name: string; bio?: string; links?: { label: string; url: string }[] },
        image: 'image-url',
        pubky: testPubky,
      });

      expect(mockUserNormalizer.to).toHaveBeenCalledTimes(1);
      expect(mockUserNormalizer.to).toHaveBeenCalledWith(
        {
          name: 'Test User',
          bio: 'Short bio',
          image: 'image-url',
          links: [{ title: 'Docs', url: 'https://example.com' }],
          status: '',
        },
        testPubky,
      );

      expect(mockProfileApplication.commitCreate).toHaveBeenCalledWith({
        profile: userResult.user,
        url: userResult.meta.url,
        pubky: testPubky,
      });
    });

    it('defaults optional fields when not provided', async () => {
      const profile = {
        name: 'Test User',
      };
      const userResult = {
        user: { toJson: vi.fn() },
        meta: { url: 'user-url' },
      };

      mockUserNormalizer.to.mockReturnValue(userResult as unknown as UserResult);
      mockProfileApplication.commitCreate.mockResolvedValue(undefined);

      await ProfileController.commitCreate({
        profile: profile as { name: string; bio?: string; links?: { label: string; url: string }[] },
        image: null,
        pubky: testPubky,
      });

      expect(mockUserNormalizer.to).toHaveBeenCalledWith(
        {
          name: 'Test User',
          bio: '',
          image: null,
          links: [],
          status: '',
        },
        testPubky,
      );

      expect(mockProfileApplication.commitCreate).toHaveBeenCalledWith({
        profile: userResult.user,
        url: userResult.meta.url,
        pubky: testPubky,
      });
    });

    it('propagates errors from the user normalizer', async () => {
      const profile = {
        name: 'Test User',
        bio: 'Short bio',
      };
      const error = new Error('validation failed');

      mockUserNormalizer.to.mockImplementation(() => {
        throw error;
      });

      await expect(
        ProfileController.commitCreate({
          profile: profile as { name: string; bio?: string; links?: { label: string; url: string }[] },
          image: null,
          pubky: testPubky,
        }),
      ).rejects.toThrow('validation failed');
      expect(mockProfileApplication.commitCreate).not.toHaveBeenCalled();
    });

    it('propagates errors from the application layer', async () => {
      const profile = {
        name: 'Test User',
        bio: 'Short bio',
      };
      const userResult = {
        user: { toJson: vi.fn() },
        meta: { url: 'user-url' },
      };

      mockUserNormalizer.to.mockReturnValue(userResult as unknown as UserResult);
      mockProfileApplication.commitCreate.mockRejectedValue(new Error('create failed'));

      await expect(
        ProfileController.commitCreate({
          profile: profile as { name: string; bio?: string; links?: { label: string; url: string }[] },
          image: null,
          pubky: testPubky,
        }),
      ).rejects.toThrow('create failed');
    });
  });

  describe('generateSecrets', () => {
    it('generates secrets and sets them in stores', () => {
      const mockSetSecrets = vi.fn();
      const mockSetCurrentUserPubky = vi.fn();

      mockOnboardingStore.getState.mockReturnValue({
        setSecrets: mockSetSecrets,
        selectSecretKey: vi.fn(() => 'test-secret-key'),
      });
      mockAuthStore.getState.mockReturnValue({
        setCurrentUserPubky: mockSetCurrentUserPubky,
      });
      mockIdentity.generateSecrets.mockReturnValue({
        secretKey: 'generated-secret-key',
        mnemonic: 'generated mnemonic',
      });
      mockIdentity.z32FromSecret.mockReturnValue('generated-pubky' as Pubky);

      ProfileController.generateSecrets();

      expect(mockIdentity.generateSecrets).toHaveBeenCalledTimes(1);
      expect(mockSetSecrets).toHaveBeenCalledWith({
        secretKey: 'generated-secret-key',
        mnemonic: 'generated mnemonic',
      });
      expect(mockIdentity.z32FromSecret).toHaveBeenCalledWith('generated-secret-key');
      expect(mockSetCurrentUserPubky).toHaveBeenCalledWith('generated-pubky');
    });
  });

  describe('createRecoveryFile', () => {
    it('creates recovery file from secret key', () => {
      const mockSelectSecretKey = vi.fn(() => 'test-secret-key');
      mockOnboardingStore.getState.mockReturnValue({
        setSecrets: vi.fn(),
        selectSecretKey: mockSelectSecretKey,
      });
      mockIdentity.keypairFromSecretKey.mockReturnValue({ keypair: 'test-keypair' });

      ProfileController.createRecoveryFile('test-passphrase');

      expect(mockSelectSecretKey).toHaveBeenCalledTimes(1);
      expect(mockIdentity.keypairFromSecretKey).toHaveBeenCalledWith('test-secret-key');
      expect(mockIdentity.createRecoveryFile).toHaveBeenCalledWith({
        keypair: { keypair: 'test-keypair' },
        passphrase: 'test-passphrase',
      });
    });

    it('throws error when secret key is not available', () => {
      const mockSelectSecretKey = vi.fn(() => {
        throw new Error('Secret key is not available');
      });
      mockOnboardingStore.getState.mockReturnValue({
        setSecrets: vi.fn(),
        selectSecretKey: mockSelectSecretKey,
      });

      expect(() => ProfileController.createRecoveryFile('test-passphrase')).toThrow('Secret key is not available');
      expect(mockIdentity.createRecoveryFile).not.toHaveBeenCalled();
    });
  });

  describe('commitDelete', () => {
    it('delegates to ProfileApplication.commitDelete', async () => {
      const setProgress = vi.fn();

      mockProfileApplication.commitDelete.mockResolvedValue(undefined);

      await ProfileController.commitDelete({ pubky: testPubky, setProgress });

      expect(mockProfileApplication.commitDelete).toHaveBeenCalledWith({
        pubky: testPubky,
        setProgress,
      });
    });

    it('propagates errors from ProfileApplication.commitDelete', async () => {
      const setProgress = vi.fn();
      const error = new Error('delete failed');

      mockProfileApplication.commitDelete.mockRejectedValue(error);

      await expect(ProfileController.commitDelete({ pubky: testPubky, setProgress })).rejects.toThrow('delete failed');
    });
  });

  describe('downloadData', () => {
    it('delegates to ProfileApplication.downloadData', async () => {
      const setProgress = vi.fn();

      mockProfileApplication.downloadData.mockResolvedValue(undefined);

      await ProfileController.downloadData({ pubky: testPubky, setProgress });

      expect(mockProfileApplication.downloadData).toHaveBeenCalledWith({
        pubky: testPubky,
        setProgress,
      });
    });

    it('propagates errors from ProfileApplication.downloadData', async () => {
      const setProgress = vi.fn();
      const error = new Error('download failed');

      mockProfileApplication.downloadData.mockRejectedValue(error);

      await expect(ProfileController.downloadData({ pubky: testPubky, setProgress })).rejects.toThrow(
        'download failed',
      );
    });
  });

  describe('commitUpdateStatus', () => {
    it('delegates to ProfileApplication.commitUpdateStatus', async () => {
      mockProfileApplication.commitUpdateStatus.mockResolvedValue(undefined);

      await ProfileController.commitUpdateStatus({ pubky: testPubky, status: 'vacationing' });

      expect(mockProfileApplication.commitUpdateStatus).toHaveBeenCalledWith({
        pubky: testPubky,
        status: 'vacationing',
      });
    });

    it('propagates errors from ProfileApplication.commitUpdateStatus', async () => {
      const error = new Error('update status failed');

      mockProfileApplication.commitUpdateStatus.mockRejectedValue(error);

      await expect(ProfileController.commitUpdateStatus({ pubky: testPubky, status: 'vacationing' })).rejects.toThrow(
        'update status failed',
      );
    });
  });

  describe('commitUpdate', () => {
    it('normalizes profile data and delegates to application layer', async () => {
      const profile = {
        name: 'Updated User',
        bio: 'Updated bio',
        links: [{ label: 'GitHub', url: 'https://github.com' }],
      };

      mockProfileApplication.commitUpdate.mockResolvedValue(undefined);

      await ProfileController.commitUpdate({
        name: profile.name,
        bio: profile.bio,
        links: profile.links,
        image: 'updated-image-url',
        pubky: testPubky,
      });

      expect(mockUserNormalizer.linksFromUi).toHaveBeenCalledWith(profile.links);
      expect(mockProfileApplication.commitUpdate).toHaveBeenCalledWith({
        pubky: testPubky,
        name: 'Updated User',
        bio: 'Updated bio',
        image: 'updated-image-url',
        links: [{ title: 'GitHub', url: 'https://github.com' }],
      });
    });

    it('defaults optional fields when not provided', async () => {
      const profile = {
        name: 'Updated User',
      };

      mockProfileApplication.commitUpdate.mockResolvedValue(undefined);

      await ProfileController.commitUpdate({
        name: profile.name,
        bio: undefined,
        links: undefined,
        image: null,
        pubky: testPubky,
      });

      expect(mockProfileApplication.commitUpdate).toHaveBeenCalledWith({
        pubky: testPubky,
        name: 'Updated User',
        bio: undefined,
        image: null,
        links: [],
      });
    });

    it('handles null image correctly', async () => {
      const profile = {
        name: 'Updated User',
        bio: 'Updated bio',
      };

      mockProfileApplication.commitUpdate.mockResolvedValue(undefined);

      await ProfileController.commitUpdate({
        name: profile.name,
        bio: profile.bio,
        links: undefined,
        image: null,
        pubky: testPubky,
      });

      expect(mockProfileApplication.commitUpdate).toHaveBeenCalledWith({
        pubky: testPubky,
        name: 'Updated User',
        bio: 'Updated bio',
        image: null,
        links: [],
      });
    });

    it('propagates errors from the application layer', async () => {
      const profile = {
        name: 'Updated User',
        bio: 'Updated bio',
      };
      const error = new Error('update failed');

      mockProfileApplication.commitUpdate.mockRejectedValue(error);

      await expect(
        ProfileController.commitUpdate({
          name: profile.name,
          bio: profile.bio,
          links: undefined,
          image: null,
          pubky: testPubky,
        }),
      ).rejects.toThrow('update failed');
    });
  });
});
