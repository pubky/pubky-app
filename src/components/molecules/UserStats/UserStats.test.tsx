import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserStats } from './UserStats';

describe('UserStats', () => {
  it('renders labelled tag and post counts', () => {
    render(<UserStats tags={761} posts={158} />);

    expect(screen.getByText('TAGS')).toBeInTheDocument();
    expect(screen.getByText('POSTS')).toBeInTheDocument();
    expect(screen.getByText('761')).toBeInTheDocument();
    expect(screen.getByText('158')).toBeInTheDocument();
  });

  it('renders zero counts', () => {
    render(<UserStats tags={0} posts={0} />);

    expect(screen.getAllByText('0')).toHaveLength(2);
  });
});
