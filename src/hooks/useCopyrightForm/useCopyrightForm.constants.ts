import type { CopyrightFormData } from './useCopyrightForm.types';

/** Allowed values for the copyright role field */
export const COPYRIGHT_ROLES = {
  RIGHTS_OWNER: 'rights_owner',
  REPORTING_ON_BEHALF: 'reporting_on_behalf',
} as const;

/** Field names for the copyright form */
export const COPYRIGHT_FORM_FIELDS = {
  ROLE: 'role',
} as const;

/** Default values for the copyright form */
export const copyrightFormDefaultValues: CopyrightFormData = {
  role: COPYRIGHT_ROLES.RIGHTS_OWNER,
  nameOwner: '',
  originalContentUrls: '',
  briefDescription: '',
  infringingContentUrl: '',
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  streetAddress: '',
  country: '',
  city: '',
  stateProvince: '',
  zipCode: '',
  signature: '',
};
