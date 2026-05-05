import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserNotFound } from './UserNotFound';

describe('UserNotFound', () => {
  it('renders the user not found message', () => {
    render(<UserNotFound />);

    expect(screen.getByText('User not found')).toBeInTheDocument();
    expect(screen.getByText("The user you're looking for doesn't exist or may have been removed.")).toBeInTheDocument();
  });

  it('renders the background image with correct alt text', () => {
    render(<UserNotFound />);

    const image = screen.getByAltText('User not found');
    expect(image).toBeInTheDocument();
  });

  describe('Snapshots', () => {
    it('matches snapshot', () => {
      const { container } = render(<UserNotFound />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
