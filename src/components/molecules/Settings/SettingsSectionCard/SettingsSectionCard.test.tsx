import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsSectionCard } from './SettingsSectionCard';
import { User } from 'lucide-react';

describe('SettingsSectionCard', () => {
  const defaultProps = {
    icon: User,
    title: 'Test Section',
    children: <div>Test content</div>,
  };

  it('renders with icon and title', () => {
    render(<SettingsSectionCard {...defaultProps} />);

    expect(screen.getByText('Test Section')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders without icon and title', () => {
    render(<SettingsSectionCard>{<div>Test content only</div>}</SettingsSectionCard>);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Test content only')).toBeInTheDocument();
  });

  it('renders with description', () => {
    render(<SettingsSectionCard {...defaultProps} description="Test description" />);

    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<SettingsSectionCard {...defaultProps} />);

    expect(screen.queryByText('Test description')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<SettingsSectionCard {...defaultProps} className="custom-section" />);
    expect(container.firstChild).toHaveClass('custom-section');
  });

  it('renders title as h2 element when provided', () => {
    render(<SettingsSectionCard {...defaultProps} />);
    const heading = screen.getByText('Test Section');
    expect(heading.tagName).toBe('H2');
  });

  it('renders description as p element when provided', () => {
    render(<SettingsSectionCard {...defaultProps} description="Test description" />);
    const paragraph = screen.getByText('Test description');
    expect(paragraph.tagName).toBe('P');
  });

  it('does not render header when only title is provided without icon', () => {
    render(<SettingsSectionCard title="Test Section">{<div>Test content</div>}</SettingsSectionCard>);

    expect(screen.queryByText('Test Section')).not.toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('does not render header when only icon is provided without title', () => {
    render(<SettingsSectionCard icon={User}>{<div>Test content</div>}</SettingsSectionCard>);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });
});

describe('SettingsSectionCard - Snapshots', () => {
  const defaultProps = {
    icon: User,
    title: 'Test Section',
    children: <div>Test content</div>,
  };

  it('matches snapshot with icon and title', () => {
    const { container } = render(<SettingsSectionCard {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot without icon and title', () => {
    const { container } = render(<SettingsSectionCard>{<div>Test content only</div>}</SettingsSectionCard>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with description', () => {
    const { container } = render(<SettingsSectionCard {...defaultProps} description="Test description" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<SettingsSectionCard {...defaultProps} className="custom-section" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
