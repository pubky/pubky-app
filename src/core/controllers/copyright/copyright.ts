import type { TCopyrightSubmitParams } from './copyright.types';
import { CopyrightApplication } from '@/application/copyright/copyright';
import { CopyrightValidators } from '@/pipes/copyright/copyright.validators';
/**
 * Controller for copyright/DMCA takedown request submission.
 * Entry point for the copyright feature, called from the API route.
 */
export class CopyrightController {
  private constructor() {}

  /**
   * Submit a copyright/DMCA takedown request to Chatwoot.
   *
   * Validates all inputs via pipes layer before delegating to application.
   *
   * @param params - Copyright form data
   * @throws AppError if validation fails or submission fails
   */
  static async submit(params: TCopyrightSubmitParams): Promise<void> {
    // Validate and normalize inputs using pipes layer
    const nameOwner = CopyrightValidators.validateNameOwner(params.nameOwner);
    const originalContentUrls = CopyrightValidators.validateOriginalContentUrls(params.originalContentUrls);
    const briefDescription = CopyrightValidators.validateBriefDescription(params.briefDescription);
    const infringingContentUrl = CopyrightValidators.validateInfringingContentUrl(params.infringingContentUrl);
    const firstName = CopyrightValidators.validateFirstName(params.firstName);
    const lastName = CopyrightValidators.validateLastName(params.lastName);
    const email = CopyrightValidators.validateEmail(params.email);
    const phoneNumber = CopyrightValidators.validatePhoneNumber(params.phoneNumber);
    const streetAddress = CopyrightValidators.validateStreetAddress(params.streetAddress);
    const country = CopyrightValidators.validateCountry(params.country);
    const city = CopyrightValidators.validateCity(params.city);
    const stateProvince = CopyrightValidators.validateStateProvince(params.stateProvince);
    const zipCode = CopyrightValidators.validateZipCode(params.zipCode);
    const signature = CopyrightValidators.validateSignature(params.signature);

    // Validate role selection
    CopyrightValidators.validateRole(params.isRightsOwner, params.isReportingOnBehalf);

    // Delegate to application layer
    await CopyrightApplication.submit({
      nameOwner,
      originalContentUrls,
      briefDescription,
      infringingContentUrl,
      firstName,
      lastName,
      email,
      phoneNumber,
      streetAddress,
      country,
      city,
      stateProvince,
      zipCode,
      signature,
      isRightsOwner: params.isRightsOwner ?? false,
      isReportingOnBehalf: params.isReportingOnBehalf ?? false,
    });
  }
}
