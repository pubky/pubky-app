/** 128 random bits for operation ownership, including on HTTP development origins. */
export function createTagMutationId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
