import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { ResourceCardFrame } from './ResourceCardFrame';

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
});
