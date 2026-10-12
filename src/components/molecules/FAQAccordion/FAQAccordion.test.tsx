import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FAQAccordion } from './FAQAccordion';
import type { FAQAccordionItem } from './FAQAccordion.types';

const mockItems: FAQAccordionItem[] = [
  {
    id: '1',
    question: 'What is Pubky?',
    answer: 'Pubky is a decentralized social platform.',
  },
  {
    id: '2',
    question: 'How do I sign up?',
    answer: 'You can sign up by creating a keypair.',
  },
];

describe('FAQAccordion', () => {
  it('renders all FAQ items', () => {
    render(<FAQAccordion items={mockItems} />);

    expect(screen.getByText('What is Pubky?')).toBeInTheDocument();
    expect(screen.getByText('How do I sign up?')).toBeInTheDocument();
  });
});
