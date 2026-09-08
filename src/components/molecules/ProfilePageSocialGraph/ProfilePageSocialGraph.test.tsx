import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';
import { ProfilePageSocialGraph } from './ProfilePageSocialGraph';

describe('ProfilePageSocialGraph', () => {
  it('renders the heading, help trigger and tier badge', () => {
    render(<ProfilePageSocialGraph status={NexusSocialGraphStatus.ESTABLISHED} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Social Graph' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About social graph status' })).toBeInTheDocument();
    expect(screen.getByText('Established')).toHaveAttribute('data-status', 'established');
  });
});

describe('ProfilePageSocialGraph - Snapshots', () => {
  it('matches snapshot for networked tier', () => {
    const { container } = render(<ProfilePageSocialGraph status={NexusSocialGraphStatus.NETWORKED} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
