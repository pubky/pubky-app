import { Fragment } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, type LucideIcon } from 'lucide-react';

/** The arrows a card's text uses, each with the word a screen reader hears for it between two words. */
const ARROWS: Readonly<Record<string, { icon: LucideIcon; word: string }>> = {
  '→': { icon: ArrowRight, word: 'to' },
  '←': { icon: ArrowLeft, word: 'from' },
  '↔': { icon: ArrowLeftRight, word: 'and' },
};

const ARROW = /([→←↔])/;

/** As large as the text and centred on its x-height, with a gap on each side. */
const ARROW_CLASS = 'mx-[0.2em] inline size-[1em] align-[-0.15em]';
/** After a space the left gap sits on that space, so a line that wraps there starts flush with the arrow. */
const ARROW_AFTER_SPACE_CLASS = 'mr-[0.2em] inline size-[1em] align-[-0.15em]';
const SPACE_CLASS = 'mr-[0.2em]';

/**
 * A card's text with its arrows drawn as the app's arrow icons (`German → American English`,
 * `131 inputs → 1 output`, `Block 57,044 →`): the font's own arrow renders thin, long and low next to
 * the text. The icon is hidden from screen readers; between two words they hear a word for it
 * (`to`), at the start or end of a link's label nothing, so the link keeps its name. Arrows inside
 * text from a provider (a node's alias) are drawn the same way.
 */
export function ResourceArrowText({ text }: { text: string }) {
  const parts = text.split(ARROW);
  if (parts.length === 1) return <>{text}</>;
  const alone = parts.length === 3 && !parts[0].trim() && !parts[2].trim();
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) {
          if (index === parts.length - 1 || !part.endsWith(' '))
            return part ? <Fragment key={index}>{part}</Fragment> : null;
          return (
            <Fragment key={index}>
              {part.slice(0, -1)}
              <span className={SPACE_CLASS}> </span>
            </Fragment>
          );
        }
        const { icon: Icon, word } = ARROWS[part];
        const afterSpace = parts[index - 1].endsWith(' ');
        const between = alone || (parts[index - 1].trim() !== '' && parts[index + 1].trim() !== '');
        return (
          <Fragment key={index}>
            <Icon
              aria-hidden="true"
              data-testid="resource-arrow"
              className={afterSpace ? ARROW_AFTER_SPACE_CLASS : ARROW_CLASS}
            />
            {between && <span className="sr-only">{word}</span>}
          </Fragment>
        );
      })}
    </>
  );
}
