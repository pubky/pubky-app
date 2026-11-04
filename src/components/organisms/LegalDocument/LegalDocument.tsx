import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { List } from '@/atoms/List/List';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { PageTitle } from '@/molecules/Page/Page';
import type { LegalDocumentProps, LegalPreamble, LegalSection } from './LegalDocument.types';

// Keeps an anchored heading clear of the sticky page header (96px tall, `--header-offset-main` from `sm`).
const ANCHOR_OFFSET_CLASS = 'scroll-mt-28 sm:scroll-mt-[calc(var(--header-offset-main)+1rem)]';
const SECTION_TITLE_CLASS = cn('text-xl font-semibold', ANCHOR_OFFSET_CLASS);
const SUBSECTION_TITLE_CLASS = cn('text-lg font-semibold', ANCHOR_OFFSET_CLASS);

/** Body paragraph of a legal text. `italic` marks the short introductions the Terms place under a heading. */
export function LegalParagraph({ children, italic = false }: { children: ReactNode; italic?: boolean }) {
  return (
    <Typography className={cn('text-base font-normal text-muted-foreground', italic && 'italic')}>
      {children}
    </Typography>
  );
}

/** Bulleted list of a legal text; nest one inside an item for a sub-list. */
export function LegalList({ children, className }: { children: ReactNode; className?: string }) {
  return <List className={cn('space-y-2', className)}>{children}</List>;
}

/** Inline link of a legal text, sized like the paragraph around it. */
export function LegalLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn('text-base', className)} {...props} />;
}

function LegalPreambleSection({ id, title, content }: LegalPreamble) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <Typography as="h2" id={id} className={SECTION_TITLE_CLASS}>
        {title}
      </Typography>
      {content}
    </section>
  );
}

function LegalNumberedSection({ section, number }: { section: LegalSection; number: number }) {
  return (
    <section aria-labelledby={section.id} className="flex flex-col gap-4">
      <Typography as="h2" id={section.id} className={SECTION_TITLE_CLASS}>
        {`${number}. ${section.title}`}
      </Typography>
      {section.content}
      {section.subsections?.map((subsection, index) => (
        <section key={subsection.id} aria-labelledby={subsection.id} className="flex flex-col gap-4">
          <Typography as="h3" id={subsection.id} className={SUBSECTION_TITLE_CLASS}>
            {`${number}.${index + 1} ${subsection.title}`}
          </Typography>
          {subsection.content}
        </section>
      ))}
    </section>
  );
}

const CONTENTS_LABEL = 'Contents';

function LegalContentsList({ sections }: { sections: LegalSection[] }) {
  return (
    <List as="ol" variant="none" className="ml-0 space-y-1.5">
      {sections.map((section, index) => (
        <li key={section.id}>
          <Link href={`#${section.id}`} variant="muted">
            {`${index + 1}. ${section.title}`}
          </Link>
        </li>
      ))}
    </List>
  );
}

/** Below `lg` the contents list is collapsed under a button, so the text starts right after the title. */
function LegalContentsCollapsible({ sections }: { sections: LegalSection[] }) {
  return (
    <Collapsible className="flex flex-col gap-4 lg:hidden">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between [&[data-state=open]>svg]:rotate-180">
          {CONTENTS_LABEL}
          <ChevronDown className="size-4 transition-transform" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <nav aria-label={CONTENTS_LABEL}>
          <LegalContentsList sections={sections} />
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** From `lg` the contents list sits beside the text and stays in view while it scrolls. */
function LegalContentsSidebar({ sections }: { sections: LegalSection[] }) {
  return (
    <nav
      aria-label={CONTENTS_LABEL}
      className="hidden flex-col gap-3 lg:sticky lg:top-(--header-offset-main) lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:max-h-[calc(100dvh-var(--header-offset-main))] lg:overflow-y-auto lg:pb-6"
    >
      <Typography size="sm" className="text-muted-foreground">
        {CONTENTS_LABEL}
      </Typography>
      <LegalContentsList sections={sections} />
    </nav>
  );
}

/**
 * A legal text (Terms of Service, Privacy Policy) as a readable page: the title and effective date, a contents
 * list, then numbered sections (`h2`) and subsections (`h3`), each with an anchor. The contents list follows the
 * title, collapsed, on narrow screens and stays beside the text from `lg`.
 */
export function LegalDocument({ title, effectiveDate, preamble, sections }: LegalDocumentProps) {
  return (
    <div className="grid w-full items-start gap-10 lg:grid-cols-2 xl:grid-cols-[minmax(0,588px)_minmax(320px,560px)] xl:justify-between">
      <PageHeader className="p-0 lg:col-start-1">
        <PageTitle>{title}</PageTitle>
        <PageSubtitle as="p">{`Effective Date: ${effectiveDate}`}</PageSubtitle>
      </PageHeader>
      <LegalContentsCollapsible sections={sections} />
      <LegalContentsSidebar sections={sections} />
      <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 [&_a]:underline">
        {preamble && <LegalPreambleSection {...preamble} />}
        {sections.map((section, index) => (
          <LegalNumberedSection key={section.id} section={section} number={index + 1} />
        ))}
      </div>
    </div>
  );
}
