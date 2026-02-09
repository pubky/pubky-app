import * as Atoms from '@/atoms';
import { NAME_TOKEN, type RepostTextProps } from './RepostText.types';

/**
 * RepostText
 *
 * Renders text with a truncatable name in the middle.
 * The name will truncate fluidly while prefix/suffix remain visible.
 *
 * Used in repost headers to display "[Name] reposted" or "[Name], others reposted"
 * where the name truncates gracefully on smaller screens.
 */
export function RepostText({ template, name, preserveSpace = false }: RepostTextProps) {
  const [prefix = '', suffix = ''] = template.split(NAME_TOKEN);

  return (
    <>
      {prefix}
      <Atoms.Typography as="span" className="min-w-0 truncate" overrideDefaults data-testid="repost-text-name">
        {name}
      </Atoms.Typography>
      {preserveSpace && '\u00A0'}
      {suffix.trimStart()}
    </>
  );
}
