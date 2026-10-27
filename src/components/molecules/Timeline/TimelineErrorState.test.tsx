import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineErrorState } from './TimelineErrorState';

describe('TimelineErrorState', () => {
  it('renders the error message', () => {
    render(<TimelineErrorState message="Network error" />);

    expect(screen.getByText('Error: Network error')).toBeInTheDocument();
  });
});
