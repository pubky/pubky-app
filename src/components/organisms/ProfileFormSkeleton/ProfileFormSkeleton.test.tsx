import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileFormSkeleton } from './ProfileFormSkeleton';

describe('ProfileFormSkeleton', () => {
  it('renders the skeleton container with its own test id', () => {
    render(<ProfileFormSkeleton />);

    expect(screen.getByTestId('profile-form-skeleton')).toBeInTheDocument();
  });

  it('renders no interactive controls', () => {
    render(<ProfileFormSkeleton />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('ProfileFormSkeleton - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<ProfileFormSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
