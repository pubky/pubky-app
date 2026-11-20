import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MigrationPage from './page';

vi.mock('@/templates/Auth/SocialMigration/SocialMigration', () => ({
  SocialMigration: vi.fn(() => <div data-testid="social-migration-template">Social migration</div>),
}));

describe('MigrationPage', () => {
  it('renders the social migration template', () => {
    render(<MigrationPage />);
    expect(screen.getByTestId('social-migration-template')).toHaveTextContent('Social migration');
  });
});
