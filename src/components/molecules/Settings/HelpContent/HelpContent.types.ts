import type { FAQAccordionItem } from '../../FAQAccordion/FAQAccordion.types';

export type FAQSection = {
  id: string;
  title: string;
  questions: FAQAccordionItem[];
};
