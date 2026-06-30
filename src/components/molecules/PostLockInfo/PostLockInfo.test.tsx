import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerifierType } from '@/services/locks/locks.types';
import { PostLockInfo } from './PostLockInfo';

describe('PostLockInfo', () => {
  it('renders the password mask for password locks', () => {
    render(<PostLockInfo verifierType={VerifierType.PASSWORD} />);

    expect(screen.getByTestId('post-lock-info')).toBeInTheDocument();
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  it('renders nothing for payment locks (until #2083)', () => {
    const { container } = render(<PostLockInfo verifierType={VerifierType.PAYMENT} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PostLockInfo - Snapshots', () => {
  it('matches snapshot for the password variant', () => {
    const { container } = render(<PostLockInfo verifierType={VerifierType.PASSWORD} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
