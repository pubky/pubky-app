import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalPage } from './LegalPage';

describe('LegalPage', () => {
  it('renders the legal text as the main content, with the landing footer', () => {
    render(
      <LegalPage>
        <h1>Privacy Policy</h1>
      </LegalPage>,
    );

    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' }));
    expect(main).toHaveTextContent(/built by Synonym Software, S\.A\. de C\.V\. ©2026/);
    expect(screen.getByAltText('Synonym')).toBeInTheDocument();
  });
});
