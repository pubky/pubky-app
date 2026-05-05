import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Help } from './Help';

describe('Help', () => {
  it('renders with default props', () => {
    render(<Help />);
    expect(screen.getByText('FAQ')).toBeInTheDocument();
  });

  it('renders FAQ sections', () => {
    render(<Help />);
    expect(screen.getByText('1. Getting Started & Onboarding')).toBeInTheDocument();
    expect(screen.getByText('2. Backups & Account Recovery')).toBeInTheDocument();
    expect(screen.getByText('3. Profile & Social Features')).toBeInTheDocument();
    expect(screen.getByText('4. How Pubky App Works')).toBeInTheDocument();
  });

  it('renders FAQ questions from all sections', () => {
    render(<Help />);
    expect(screen.getByText('Why does Pubky require invite codes?')).toBeInTheDocument();
    expect(screen.getByText('How do I use Pubky Ring with the web app?')).toBeInTheDocument();
    expect(screen.getByText('How can I restore my account?')).toBeInTheDocument();
    expect(screen.getByText('How can I update my profile information?')).toBeInTheDocument();
    expect(screen.getByText('How is Pubky different from other social media platforms?')).toBeInTheDocument();
  });

  it('renders User Guide section', () => {
    render(<Help />);
    const userGuideHeaders = screen.getAllByText('User Guide');
    expect(userGuideHeaders.length).toBeGreaterThan(0);
  });

  it('renders Support section', () => {
    render(<Help />);
    expect(screen.getByText('Support')).toBeInTheDocument();
  });
});

describe('Help - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Help />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
