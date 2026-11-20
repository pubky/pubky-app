'use client';

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { ChevronDown, Circle } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/atoms/DropdownMenu/DropdownMenu';
import { MENU_VARIANT, type MenuVariant } from '@/config/ui';
import { cn } from '@/libs/utils/utils';
import { getLanguageName, getLanguageTag, type TAlsoOnEdition } from './ResourceAlsoOn.utils';
import { useAlsoOnEdition } from './useAlsoOnEdition';

// About seven languages in view, scrolling on its own: the rest of the menu stays in reach.
const LIST_CLASS_NAME = 'max-h-56 overflow-y-auto border-l border-border';

interface ResourceAlsoOnLanguagesProps {
  /** The service's name without a language (`Wikipedia`). */
  name: string;
  /** Its editions, two or more, in the order Also on lists them. */
  editions: TAlsoOnEdition[];
  /** Where it renders: the ⋯ dropdown or the ⋯ bottom sheet on a phone. */
  variant: MenuVariant;
  /** The menu's row for the edition shown. */
  renderRow: (edition: TAlsoOnEdition) => ReactNode;
}

/**
 * One service in several languages in a card's ⋯ menu: a row for the viewer's edition, then a
 * "Change <name> language" toggle that unfolds the languages as radio items inside the menu (a
 * submenu would not fit on a phone). Picking one changes where the row links; it opens nothing.
 * The languages are the viewer's ones the service has (`useAlsoOnEdition`); with only one of them,
 * the row shows that edition and there is no toggle.
 */
export function ResourceAlsoOnLanguages({ name, editions, variant, renderRow }: ResourceAlsoOnLanguagesProps) {
  const listId = useId();
  const toggleRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { edition, choices, setLang } = useAlsoOnEdition(editions);

  const toggleProps = {
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? listId : undefined,
    'data-testid': 'resource-also-on-languages-trigger',
  };
  const toggleContent = (
    <>
      Change {name} language
      <ChevronDown aria-hidden="true" className={cn('ml-auto size-4 shrink-0', isOpen && 'rotate-180')} />
    </>
  );
  const listProps = {
    id: listId,
    'aria-label': `${name} language`,
    'data-testid': 'resource-also-on-languages',
  };
  // Picks without opening anything: focus goes back to the toggle before the list folds.
  const pick = (lang: string) => {
    setLang(lang);
    toggleRef.current?.focus();
    setIsOpen(false);
  };

  if (choices.length < 2) return renderRow(edition);

  if (variant === MENU_VARIANT.SHEET) {
    return (
      <>
        {renderRow(edition)}
        <Button
          ref={(node) => {
            toggleRef.current = node;
          }}
          variant="ghost"
          {...toggleProps}
          // Lines up under the row's name (the button's `px-4`, the icon and its gap).
          className="justify-start gap-2 pl-10 text-xs text-muted-foreground"
          onClick={() => setIsOpen(!isOpen)}
        >
          {toggleContent}
        </Button>
        {isOpen && (
          <Container
            overrideDefaults
            role="radiogroup"
            {...listProps}
            className={cn('ml-8', LIST_CLASS_NAME)}
            onKeyDown={moveRadioFocus}
          >
            {choices.map(({ lang }) => {
              const isChecked = lang === edition.lang;
              return (
                <Button
                  key={lang}
                  ref={isChecked ? focusIntoSight : undefined}
                  variant="ghost"
                  role="radio"
                  aria-checked={isChecked}
                  // One Tab stop for the group; the arrow keys move between the languages.
                  tabIndex={isChecked ? 0 : -1}
                  className="w-full justify-start gap-2 pl-2 text-xs"
                  onClick={() => pick(lang)}
                >
                  <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
                    {isChecked && <Circle className="size-2 fill-current" />}
                  </span>
                  <span lang={getLanguageTag(lang)}>{getLanguageName(lang)}</span>
                </Button>
              );
            })}
          </Container>
        )}
      </>
    );
  }

  return (
    <>
      {renderRow(edition)}
      <DropdownMenuItem
        ref={(node) => {
          toggleRef.current = node;
        }}
        {...toggleProps}
        // Lines up under the row's name (the icon and its gap; the rows have no padding).
        className="gap-2 p-0 pl-6 text-xs text-muted-foreground hover:text-foreground focus:text-foreground"
        // Keeps the menu open: the languages unfold below.
        onSelect={(event) => {
          event.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        {toggleContent}
      </DropdownMenuItem>
      {isOpen && (
        <DropdownMenuRadioGroup {...listProps} value={edition.lang} className={cn('ml-4', LIST_CLASS_NAME)}>
          {choices.map(({ lang }) => (
            <DropdownMenuRadioItem
              key={lang}
              ref={lang === edition.lang ? focusIntoSight : undefined}
              value={lang}
              className="cursor-pointer text-xs hover:bg-accent focus:bg-accent"
              onSelect={(event) => {
                event.preventDefault();
                pick(lang);
              }}
            >
              <span lang={getLanguageTag(lang)}>{getLanguageName(lang)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      )}
    </>
  );
}

/**
 * Focuses the checked language as the list mounts and brings it into the menu's view (`nearest`, so
 * a list taller than the menu does not push the toggle out of sight). A module-level callback keeps
 * one identity, so React calls it once per mount; scrollIntoView is absent in jsdom, hence the
 * optional call.
 */
function focusIntoSight(node: HTMLElement | null) {
  if (!node) return;
  node.focus({ preventScroll: true });
  node.scrollIntoView?.({ block: 'nearest' });
}

const NEXT_KEYS = ['ArrowDown', 'ArrowRight'];
const PREVIOUS_KEYS = ['ArrowUp', 'ArrowLeft'];

/**
 * The sheet's radio group keyboard: the arrow keys move focus to the next or previous language
 * (wrapping), Home and End to the first and last. Focus only: Enter or Space picks, as a tap does.
 */
function moveRadioFocus(event: KeyboardEvent<HTMLElement>) {
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const current = radios.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (NEXT_KEYS.includes(event.key)) next = (current + 1) % radios.length;
  else if (PREVIOUS_KEYS.includes(event.key)) next = (current - 1 + radios.length) % radios.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = radios.length - 1;
  else return;
  event.preventDefault();
  radios[next]?.focus();
  radios[next]?.scrollIntoView?.({ block: 'nearest' });
}
