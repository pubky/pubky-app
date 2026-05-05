import { ZustandGet } from '../stores.types';
import { OnboardingStore } from './onboarding.types';

export const createOnboardingSelectors = (get: ZustandGet<OnboardingStore>) => ({
  /**
   * Gets the secret key (private key) from the keypair
   * @returns The secret key as a hex string
   * @throws Error if keypair is not available
   */
  selectSecretKey: () => {
    const secretKey = get().secretKey;
    if (!secretKey) {
      // TODO: Specific error type
      throw new Error('Secret key is not available. Please generate first.');
    }
    return secretKey;
  },

  /**
   * Gets the mnemonic recovery phrase
   * @returns The mnemonic as a string
   * @throws Error if mnemonic is not available
   */
  selectMnemonic: () => {
    const mnemonic = get().mnemonic;
    if (!mnemonic) {
      // TODO: Specific error type
      throw new Error('Mnemonic is not available. Please generate a keypair first.');
    }
    return mnemonic;
  },
});
