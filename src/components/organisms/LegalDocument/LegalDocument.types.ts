import type { ReactNode } from 'react';

/** A numbered subsection (`3.1`), rendered as an `h3` with its own anchor. */
export interface LegalSubsection {
  /** Anchor id; keep it stable so shared `#links` keep working after copy edits. */
  id: string;
  title: string;
  content: ReactNode;
}

/** A numbered section (`3.`), rendered as an `h2` with its own anchor and a contents entry. */
export interface LegalSection {
  /** Anchor id; keep it stable so shared `#links` keep working after copy edits. */
  id: string;
  title: string;
  /** Text shown before the first subsection. */
  content?: ReactNode;
  subsections?: LegalSubsection[];
}

/** The unnumbered opening of a document, shown before section 1 and left out of the contents. */
export interface LegalPreamble {
  id: string;
  title: string;
  content: ReactNode;
}

export interface LegalDocumentProps {
  /** Page heading (`h1`); may highlight a word with `text-brand`. */
  title: ReactNode;
  /** Date the text took effect, as written in the document (e.g. `January 29, 2026`). */
  effectiveDate: string;
  preamble?: LegalPreamble;
  sections: LegalSection[];
}
