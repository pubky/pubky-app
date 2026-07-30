import parsePhoneNumberFromString, { PhoneNumber } from 'libphonenumber-js/mobile';

const E164_DIGITS_ONLY = /^\+(\d)*$/;
const ARGENTINA_CALLING_CODE = '54';

/**
 * Argentina mobiles in E.164 need a trunk `9` after `+54`
 * (e.g. `+54 9 11 …`). Users often omit it; insert and re-validate.
 */
function tryNormalizeArgentinaMobile(parsed: PhoneNumber): PhoneNumber | undefined {
  if (parsed.country !== 'AR' && parsed.countryCallingCode !== ARGENTINA_CALLING_CODE) {
    return;
  }

  const nationalNumber = parsed.nationalNumber;
  if (!nationalNumber || nationalNumber.startsWith('9')) {
    return;
  }

  const withMobileTrunk = `+${ARGENTINA_CALLING_CODE}9${nationalNumber}`;
  const normalized = parsePhoneNumberFromString(withMobileTrunk);
  if (!normalized?.isValid()) {
    return;
  }

  return normalized;
}

/**
 * Validates an international phone number in E.164 format.
 * @param phoneNumber - The phone number to validate (e.g., "+316XXXXXXXX")
 * @returns The parsed phone number if valid, undefined otherwise
 */
export function parsePhoneNumber(phoneNumber: string): PhoneNumber | undefined {
  const trimmed = phoneNumber.trim().replaceAll(' ', '');

  // Check if there are any non-digit characters other than the plus sign
  if (!E164_DIGITS_ONLY.test(trimmed)) {
    return;
  }

  // Use libphonenumber-js to parse and validate the number
  const parsed = parsePhoneNumberFromString(trimmed);

  if (!parsed) {
    return;
  }

  if (parsed.isValid()) {
    return parsed;
  }

  return tryNormalizeArgentinaMobile(parsed);
}
