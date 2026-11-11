import { z } from 'zod';
import {
  USER_BIO_MAX_LENGTH,
  USER_LINK_URL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_NAME_MIN_LENGTH,
} from '@/config/user';
import { getCharacterCount, isReservedUserName } from '@/libs/utils/utils';
import { TAG_FROZEN_WHITESPACE } from '@/libs/utils/utils.constants';

/** U+0000 to U+001F and U+007F: the data model refuses a web URI that carries one, as it does whitespace. */
const ASCII_CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * The host the data model reads from a web URI: the authority after the scheme's `//`, past any userinfo
 * and before any port, which must not be empty. The WHATWG parser behind `z.url()` forgives
 * `https:///host/path`; the data model does not.
 */
function hasWebHost(url: string): boolean {
  const rest = url.slice(url.indexOf('//') + 2);
  const end = rest.search(/[/?#]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  const host = hostPort.startsWith('[') ? hostPort : hostPort.split(':')[0];
  return host !== '';
}

/**
 * A profile link as the v1 data model stores it (`buildUser`, through `checkReference(..., 'web')`): the
 * trimmed text starts with `http://` or `https://` spelled in lower case, names a host, parses as a URL,
 * carries no ASCII control or frozen whitespace character anywhere (the package's one whitespace table,
 * pinned as `TAG_FROZEN_WHITESPACE`) and has at most `USER_LINK_URL_MAX_LENGTH` code points. The form
 * refuses here, with copy for the field, what the builder would refuse at the write; each refinement
 * aborts, so a link gets one message. `safeExternalUrlSchema` also admits `mailto:`, `tel:` and any
 * spelling of the scheme (#2224): it stays the rule for rendering and opening the links a legacy
 * profile still carries.
 */
export const profileLinkUrlSchema = z
  .string()
  .trim()
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'Links must start with http:// or https://',
    abort: true,
  })
  .refine((url) => hasWebHost(url) && !ASCII_CONTROL.test(url) && !TAG_FROZEN_WHITESPACE.test(url), {
    message: 'Invalid URL',
    abort: true,
  })
  .refine((url) => getCharacterCount(url) <= USER_LINK_URL_MAX_LENGTH, {
    message: `Links must be no more than ${USER_LINK_URL_MAX_LENGTH} characters`,
    abort: true,
  })
  .pipe(z.url({ protocol: /^https?$/, error: 'Invalid URL' }));

export class UserValidator {
  static check(name: string, bio: string, links: { label: string; url: string }[], avatarFile: File | null) {
    // The rows with a URL, each with the row the caller shows it in: the schema parses the filtered
    // list, while a reported `link_${index}` must name the form row
    const linkRows = links
      .map((link, row) => ({ link: { ...link, url: link.url.trim() }, row }))
      .filter(({ link }) => link.url.length > 0);
    const result = UiUserSchema.safeParse({
      name,
      bio,
      links: linkRows.length > 0 ? linkRows.map(({ link }) => link) : undefined,
      avatar: avatarFile,
    });

    const errorList: { type: string; message: string }[] = [];

    if (!result.success) {
      for (const issue of result.error.issues) {
        const path0 = issue.path[0];
        if (path0 === 'name') errorList.push({ type: 'name', message: issue.message });
        if (path0 === 'bio') errorList.push({ type: 'bio', message: issue.message });
        if (path0 === 'links') {
          const index = typeof issue.path[1] === 'number' ? (issue.path[1] as number) : undefined;
          const field = issue.path[2];
          if (typeof index === 'number' && field === 'url') {
            errorList.push({ type: `link_${linkRows[index]?.row ?? index}`, message: issue.message });
          }
        }
        if (path0 === 'avatar') errorList.push({ type: 'avatar', message: issue.message });
      }
    }
    return {
      data: result.data,
      error: errorList,
    };
  }
}

export const UiUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(USER_NAME_MIN_LENGTH, `Name must be at least ${USER_NAME_MIN_LENGTH} characters`)
    .max(USER_NAME_MAX_LENGTH, `Name must be no more than ${USER_NAME_MAX_LENGTH} characters`)
    .refine((value) => !isReservedUserName(value), { message: 'This name is reserved' }),
  bio: z
    .string()
    .trim()
    .max(USER_BIO_MAX_LENGTH, `Bio must be no more than ${USER_BIO_MAX_LENGTH} characters`)
    .optional(),
  links: z
    .array(
      z.object({
        label: z.string().min(1, 'Label is required'),
        url: profileLinkUrlSchema,
      }),
    )
    .optional(),
  avatar: z
    .union([z.instanceof(File), z.null()])
    .refine((file) => file == null || file.type.startsWith('image/'), {
      message: 'Avatar must be an image file',
    })
    .optional(),
});
