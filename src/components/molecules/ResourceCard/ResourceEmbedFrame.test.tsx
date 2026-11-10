import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { ResourceEmbedFrame } from './ResourceEmbedFrame';

const URL = videoFixture.uri;

describe('ResourceEmbedFrame', () => {
  it('puts the embed between the header and the footer, with no click-through', () => {
    render(
      <ResourceEmbedFrame url={URL} card={videoFixture} actions={<div data-testid="actions" />}>
        <div data-testid="embed" />
      </ResourceEmbedFrame>,
    );

    const frame = screen.getByTestId('resource-embed-frame');
    expect(frame).not.toHaveAttribute('data-click-through');
    expect(screen.getByTestId('resource-embed-body')).toContainElement(screen.getByTestId('embed'));
    expect(frame.lastElementChild).toBe(screen.getByTestId('actions'));
  });

  it('links the type to the resource page and the site to the link in a new tab', () => {
    render(
      <ResourceEmbedFrame url={URL} card={videoFixture} actions={null}>
        <div />
      </ResourceEmbedFrame>,
    );

    const type = screen.getByTestId('resource-card-type');
    expect(type).toHaveTextContent('Video');
    expect(type).toHaveAttribute('href', getResourceRoute(videoFixture.uri));
    expect(type).not.toHaveAttribute('target');
    const source = screen.getByTestId('resource-card-source');
    expect(source).toHaveTextContent('YouTube');
    expect(source).toHaveAttribute('href', URL);
    expect(source).toHaveAttribute('target', '_blank');
  });

  it('opens the resource page in a new tab where links may not navigate (the composer)', () => {
    render(
      <PostPreviewNavigableProvider navigable={false}>
        <ResourceEmbedFrame url={URL} card={videoFixture} actions={null}>
          <div />
        </ResourceEmbedFrame>
      </PostPreviewNavigableProvider>,
    );

    expect(screen.getByTestId('resource-card-type')).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('resource-card-type')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('names the host and the embed’s kind without a card', () => {
    const link = 'https://www.x.com/a/status/1';
    render(
      <ResourceEmbedFrame url={link} card={null} actions={null} fallbackTypeLabel="Post">
        <div />
      </ResourceEmbedFrame>,
    );

    expect(screen.getByTestId('resource-card-type')).toHaveTextContent('Post');
    expect(screen.getByTestId('resource-card-type')).toHaveAttribute('href', getResourceRoute(link));
    expect(screen.getByTestId('resource-card-source')).toHaveTextContent('x.com');
  });
});
