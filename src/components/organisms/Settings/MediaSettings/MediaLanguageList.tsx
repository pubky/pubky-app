'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { Languages } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { getLanguageName, getLanguageTag } from '@/molecules/ResourceCard/ResourceAlsoOn.utils';
import { WIKIPEDIA_LANGUAGES } from './MediaLanguageList.constants';
import { type MediaRankedItem, MediaRankedList } from './MediaRankedList';

interface MediaLanguageListProps {
  /** The viewer's Wikipedia languages in order (`media.languages`); empty is Auto. */
  languages: string[];
  /** Saves the new list (`setLanguages`). */
  onChange: (languages: string[]) => void;
}

/** An Add entry: the language's own name with its code (`Deutsch (de)`). */
function toItem(lang: string): MediaRankedItem {
  return { id: lang, name: getLanguageName(lang), lang: getLanguageTag(lang) };
}

/** A row: as an Add entry, after the app's languages icon, so the names line up with the Players'. */
function toRow(lang: string): MediaRankedItem {
  return { ...toItem(lang), icon: <Languages className="size-4 shrink-0" aria-hidden="true" /> };
}

/**
 * The Wikipedia languages of Links & Media, ranked as the Players (`MediaRankedList`): a service in
 * several languages opens in the first of these it has, and its language switch lists only these
 * (`useAlsoOnEdition`). Add offers every Wikipedia language not in the list, by its own name (by
 * its code after those, where the browser has no name), in a menu that scrolls (and jumps to a typed
 * name, as menus do). Until one is added, the list is empty
 * and the browser's languages are used.
 */
export function MediaLanguageList({ languages, onChange }: MediaLanguageListProps) {
  // By name; the codes the browser cannot name (it names about half of them) after, by code.
  const addable = WIKIPEDIA_LANGUAGES.filter((lang) => !languages.includes(lang))
    .map(toItem)
    .sort((a, b) => Number(a.name === a.id) - Number(b.name === b.id) || a.name.localeCompare(b.name));

  return (
    <Container overrideDefaults className="flex w-full flex-col items-start gap-2">
      <Typography id="media-languages-label" size="sm" className="leading-5 font-medium">
        {'Wikipedia languages'}
      </Typography>
      <Typography size="sm" className="font-normal text-muted-foreground">
        {
          'Wikipedia and other wikis open in the first of these languages they have. Until you add one, your browser’s languages are used.'
        }
      </Typography>
      <MediaRankedList
        kind="language"
        labelId="media-languages-label"
        items={languages.map(toRow)}
        addable={addable}
        addLabel="Add a Wikipedia language"
        addMenuClassName="max-h-72 overflow-y-auto"
        onMove={(from, to) => onChange(arrayMove(languages, languages.indexOf(from), languages.indexOf(to)))}
        onRemove={(id) => onChange(languages.filter((lang) => lang !== id))}
        onAdd={(id) => onChange([...languages, id])}
      />
    </Container>
  );
}
