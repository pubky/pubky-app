import { isPubchiKnownAnswerBasis, type PubchiKnownAnswerBasis } from './schemas/answer';

export const PUBCHI_BASIS_HEADINGS: Record<PubchiKnownAnswerBasis, string> = {
  web: 'From the web',
  knowledge: 'From Pubky docs',
  graph: 'What the graph shows',
  mixed: 'From more than one source',
  model: 'From what I know',
};

export const PUBCHI_BASIS_HEADING_DEFAULT = PUBCHI_BASIS_HEADINGS.model;

export const PUBCHI_BASIS_HEADING_EVIDENCE = "Pubchi's reading of the evidence";

export function pubchiBasisHeading(basis: string | undefined): string {
  if (basis && isPubchiKnownAnswerBasis(basis)) return PUBCHI_BASIS_HEADINGS[basis];
  return PUBCHI_BASIS_HEADING_DEFAULT;
}
