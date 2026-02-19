import * as Core from '@/core';
import * as Libs from '@/libs';

// Operations related with the profile.json file in the homeserver
export class ProfileController {
  private constructor() {} // Prevent instantiation

  /**
   * Commits the create profile operation to the homeserver.
   * @param profile - The profile to create
   * @param image - The image to create
   * @param pubky - The public key of the user
   */
  static async commitCreate({ profile, image, pubky }: Core.TCommitSetDetailsParams) {
    const { user, meta } = Core.UserNormalizer.to(
      {
        name: profile.name,
        bio: profile.bio ?? '',
        image,
        links: Core.UserNormalizer.linksFromUi(profile.links),
        status: '', // default is blank
      },
      pubky,
    );

    await Core.ProfileApplication.commitCreate({ profile: user, url: meta.url, pubky });
  }

  /**
   * Commits the update status operation to the homeserver and local database.
   * @param pubky - The public key of the user
   * @param status - The status to update
   */
  static async commitUpdateStatus({ pubky, status }: { pubky: Core.Pubky; status: string }) {
    return await Core.ProfileApplication.commitUpdateStatus({ pubky, status });
  }

  /**
   * Commits the update profile operation to the homeserver and local database.
   * @param name - The name to update
   * @param bio - The bio to update
   * @param links - The links to update
   * @param image - The image to update
   * @param pubky - The public key of the user
   */
  static async commitUpdate({ name, bio, links, image, pubky }: Core.TCommitUpdateDetailsParams) {
    await Core.ProfileApplication.commitUpdate({
      pubky,
      name,
      bio,
      image,
      links: Core.UserNormalizer.linksFromUi(links),
    });
  }

  /**
   * Generates a new pair of secret key and mnemonic and sets them in the onboarding and auth stores.
   */
  static generateSecrets() {
    const secrets = Libs.Identity.generateSecrets();
    Core.useOnboardingStore.getState().setSecrets(secrets);
    Core.useAuthStore.getState().setCurrentUserPubky(Libs.Identity.z32FromSecret(secrets.secretKey));
  }

  /**
   * Creates a recovery file for the keypair
   * @param passphrase - The passphrase to use to create the recovery file
   */
  static createRecoveryFile(passphrase: string) {
    const secretKey = Core.useOnboardingStore.getState().selectSecretKey();
    const keypair = Libs.Identity.keypairFromSecretKey(secretKey);
    Libs.Identity.createRecoveryFile({ keypair, passphrase });
  }

  /**
   * Commits the delete profile operation to the homeserver and local database.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async commitDelete({ pubky, setProgress }: Core.TDeleteAccountInput) {
    await Core.ProfileApplication.commitDelete({ pubky, setProgress });
  }

  /**
   * Downloads all user data from the homeserver and packages it into a ZIP file.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async downloadData({ pubky, setProgress }: Core.TDownloadDataInput) {
    await Core.ProfileApplication.downloadData({ pubky, setProgress });
  }
}
