import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { ResourceCardFrame } from './ResourceCardFrame';
import { ResourceSurfaceProvider } from './ResourceSurfaceContext';

describe('resource embed surface', () => {
  it('shares the post and link preview surface token for the frame and its skeleton', () => {
    render(
      <>
        <ResourceCardFrame clickThroughUrl={null}>Resource</ResourceCardFrame>
        <ResourceCardSkeleton />
      </>,
    );
    for (const element of [screen.getByRole('article'), screen.getByTestId('resource-card-skeleton')]) {
      expect(element).toHaveClass('bg-embed');
      expect(element).not.toHaveClass('bg-muted');
    }
  });

  it('puts a card that is the item itself, and its skeleton, on the post card’s surface', () => {
    render(
      <ResourceSurfaceProvider surface="card">
        <ResourceCardFrame clickThroughUrl={null}>Resource</ResourceCardFrame>
        <ResourceCardSkeleton />
      </ResourceSurfaceProvider>,
    );
    for (const element of [screen.getByRole('article'), screen.getByTestId('resource-card-skeleton')]) {
      expect(element).toHaveClass('bg-card', 'text-card-foreground', 'shadow-sm');
      expect(element).not.toHaveClass('bg-embed');
    }
  });
});
