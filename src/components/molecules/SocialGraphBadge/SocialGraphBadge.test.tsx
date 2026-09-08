import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';
import { SocialGraphBadge } from './SocialGraphBadge';

describe('SocialGraphBadge', () => {
  it('renders the tier label as an outline badge', () => {
    render(<SocialGraphBadge status={NexusSocialGraphStatus.NETWORKED} />);

    const badge = screen.getByText('Networked');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveAttribute('data-variant', 'outline');
    expect(badge).toHaveAttribute('data-status', 'networked');
  });

  it.each([
    [NexusSocialGraphStatus.NEW, 'New', ['border-chart-6', 'text-chart-6']],
    [NexusSocialGraphStatus.NETWORKED, 'Networked', ['border-brand', 'text-brand']],
    [NexusSocialGraphStatus.ESTABLISHED, 'Established', ['border-chart-3', 'text-chart-3']],
  ])('colours the %s tier', (status, label, classes) => {
    render(<SocialGraphBadge status={status} />);

    const badge = screen.getByText(label);
    expect(badge).toHaveClass('uppercase', 'font-semibold', ...classes);
    // The tier colour must win over the Badge atom's transparent border
    expect(badge).not.toHaveClass('border-transparent');
  });

  it('merges a custom className', () => {
    render(<SocialGraphBadge status={NexusSocialGraphStatus.NEW} className="custom-class" />);

    expect(screen.getByText('New')).toHaveClass('custom-class');
  });
});

describe('SocialGraphBadge - Snapshots', () => {
  it('matches snapshot for new tier', () => {
    const { container } = render(<SocialGraphBadge status={NexusSocialGraphStatus.NEW} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for networked tier', () => {
    const { container } = render(<SocialGraphBadge status={NexusSocialGraphStatus.NETWORKED} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for established tier', () => {
    const { container } = render(<SocialGraphBadge status={NexusSocialGraphStatus.ESTABLISHED} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
