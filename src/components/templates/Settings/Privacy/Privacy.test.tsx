import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { Privacy } from './Privacy';

describe('Privacy', () => {
  it('renders privacy content', () => {
    render(<Privacy />);
    expect(screen.getByText('Privacy and Safety')).toBeInTheDocument();
  });

  it('renders privacy switches', () => {
    render(<Privacy />);
    expect(screen.getByText('Show confirmation before redirecting')).toBeInTheDocument();
    expect(screen.getByText('Blur censored posts or profile pictures')).toBeInTheDocument();
  });

  it('shows no local index status while the local index is not a source', () => {
    render(<Privacy />);
    expect(screen.queryByText('Your network')).not.toBeInTheDocument();
  });

  it('shows the local index status while the local index is a source', () => {
    process.env.PUBKY_RUNTIME_INDEXER_SOURCES = 'local';
    resetRuntimeConfigForTests();
    try {
      render(<Privacy />);
      expect(screen.getByText('Your network')).toBeInTheDocument();
      expect(screen.getByText('The local index is not running in this tab.')).toBeInTheDocument();
    } finally {
      delete process.env.PUBKY_RUNTIME_INDEXER_SOURCES;
      resetRuntimeConfigForTests();
    }
  });
});
