const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

export const PUBKY_REDACTED = '[redacted: pubky identifier]';
export const EMAIL_REDACTED = '[redacted: email]';
export const PHONE_REDACTED = '[redacted: phone]';
export const SENSITIVE_VALUE_REDACTED = '[redacted: sensitive field]';

export const RAW_PUBKY_PATTERN = new RegExp(`\\b[${Z32_ALPHABET}]{52}\\b`, 'gi');
export const PUBKY_URI_PATTERN = /\bpubky:\/\/[^\s"'<>]+/gi;
export const PUBKY_HTTP_HOST_PATTERN = /\bhttps?:\/\/_pubky\.[^\s"'<>]+/gi;
export const PUBKY_COMPACT_URI_PATTERN = new RegExp(`\\bpubky[${Z32_ALPHABET}]{52}(?:\\/[^\\s"'<>]*)?`, 'gi');
export const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
export const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
export const NEXUS_POST_TAGS_PATH_PATTERN = /^\/v0\/post\/[^/]+\/[^/]+\/tags$/;

export const SENSITIVE_CONTEXT_KEYS = new Set([
  'avatar',
  'bio',
  'displayname',
  'email',
  'file',
  'firstname',
  'image',
  'lastname',
  'name',
  'phone',
  'phonenumber',
  'publickey',
  'pubky',
  'signature',
  'user',
  'userid',
  'username',
]);

export const PUBKY_IDENTIFIER_KEYS = new Set([
  'author',
  'authorid',
  'followee',
  'follower',
  'mutee',
  'muter',
  'taggerid',
]);
