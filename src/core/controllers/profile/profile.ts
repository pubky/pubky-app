import { Identity } from '@/libs/identity/identity';
import { ProfileApplication } from '@/application/profile/profile';
import type {
  TCommitSetDetailsParams,
  TCommitUpdateDetailsParams,
  TDeleteAccountInput,
  TDownloadDataInput,
} from '@/controllers/profile/profile.types';
import type { Pubky } from '@/models/models.types';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
// Operations related with the profile.json file in the homeserver
export class ProfileController {
  private constructor() {} // Prevent instantiation

  /**
   * Commits the create profile operation to the homeserver.
   * @param profile - The profile to create
   * @param image - The image to create
   * @param pubky - The public key of the user
   */
  static async commitCreate({ profile, image, pubky }: TCommitSetDetailsParams) {
    const { user, meta } = UserNormalizer.to(
      {
        name: profile.name,
        bio: profile.bio ?? '',
        image,
        links: UserNormalizer.linksFromUi(profile.links),
        status: '', // default is blank
      },
      pubky,
    );

    await ProfileApplication.commitCreate({ profile: user, url: meta.url, pubky });
  }

  /**
   * Commits the update status operation to the homeserver and local database.
   * @param pubky - The public key of the user
   * @param status - The status to update
   */
  static async commitUpdateStatus({ pubky, status }: { pubky: Pubky; status: string }) {
    return await ProfileApplication.commitUpdateStatus({ pubky, status });
  }

  /**
   * Commits the update profile operation to the homeserver and local database.
   * @param name - The name to update
   * @param bio - The bio to update
   * @param links - The links to update
   * @param image - The image to update
   * @param pubky - The public key of the user
   */
  static async commitUpdate({ name, bio, links, image, pubky }: TCommitUpdateDetailsParams) {
    await ProfileApplication.commitUpdate({
      pubky,
      name,
      bio,
      image,
      links: UserNormalizer.linksFromUi(links),
    });
  }

  /**
   * Generates a new pair of secret key and mnemonic and sets them in the onboarding and auth stores.
   */
  static generateSecrets() {
    const secrets = Identity.generateSecrets();
    useOnboardingStore.getState().setSecrets(secrets);
    useAuthStore.getState().setCurrentUserPubky(Identity.z32FromSecret(secrets.secretKey));
  }

  /**
   * Creates a recovery file for the keypair
   * @param passphrase - The passphrase to use to create the recovery file
   */
  static createRecoveryFile(passphrase: string) {
    const secretKey = useOnboardingStore.getState().selectSecretKey();
    const keypair = Identity.keypairFromSecretKey(secretKey);
    Identity.createRecoveryFile({ keypair, passphrase });
  }

  /**
   * Commits the delete profile operation to the homeserver and local database.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async commitDelete({ pubky, setProgress }: TDeleteAccountInput) {
    await ProfileApplication.commitDelete({ pubky, setProgress });
  }

  /**
   * Downloads all user data from the homeserver and packages it into a ZIP file.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async downloadData({ pubky, setProgress }: TDownloadDataInput) {
    await ProfileApplication.downloadData({ pubky, setProgress });
  }
}
