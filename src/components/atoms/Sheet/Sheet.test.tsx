import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock @/libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './Sheet';

describe('Sheet', () => {
  it('renders Sheet root correctly', () => {
    render(
      <Sheet>
        <div>Sheet Content</div>
      </Sheet>,
    );
    expect(screen.getByText('Sheet Content')).toBeInTheDocument();
  });

  it('renders SheetTrigger correctly', () => {
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
      </Sheet>,
    );
    expect(screen.getByText('Open Sheet')).toBeInTheDocument();
  });

  it('renders SheetTrigger with asChild', () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open Sheet</button>
        </SheetTrigger>
      </Sheet>,
    );
    expect(screen.getByText('Open Sheet')).toBeInTheDocument();
  });

  it('renders SheetContent with default side', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <div>Sheet Content</div>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Sheet Content')).toBeInTheDocument();
  });

  it('renders SheetContent with different sides', () => {
    const { rerender } = render(
      <Sheet open={true}>
        <SheetContent side="top">
          <div>Top Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Top Sheet')).toBeInTheDocument();

    rerender(
      <Sheet open={true}>
        <SheetContent side="bottom">
          <div>Bottom Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Bottom Sheet')).toBeInTheDocument();

    rerender(
      <Sheet open={true}>
        <SheetContent side="left">
          <div>Left Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Left Sheet')).toBeInTheDocument();

    rerender(
      <Sheet open={true}>
        <SheetContent side="right">
          <div>Right Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Right Sheet')).toBeInTheDocument();
  });

  it('renders SheetHeader correctly', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Sheet Title')).toBeInTheDocument();
  });

  it('renders SheetTitle correctly', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetTitle>My Sheet Title</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const title = screen.getByText('My Sheet Title');
    expect(title).toBeInTheDocument();
  });

  it('renders SheetDescription correctly', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetDescription>My Sheet Description</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const description = screen.getByText('My Sheet Description');
    expect(description).toBeInTheDocument();
  });

  it('renders SheetHeader with Title and Description', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet Description</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Sheet Title')).toBeInTheDocument();
    expect(screen.getByText('Sheet Description')).toBeInTheDocument();
  });

  it('renders close button in SheetContent', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <div>Sheet Content</div>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Sheet Content')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});

describe('Sheet - Snapshots', () => {
  it('matches snapshot for Sheet with default props', () => {
    const { container } = render(
      <Sheet>
        <div>Sheet Content</div>
      </Sheet>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for SheetTrigger with default props', () => {
    const { container } = render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
      </Sheet>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for SheetTrigger with asChild', () => {
    const { container } = render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open Sheet</button>
        </SheetTrigger>
      </Sheet>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for SheetContent with default side', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <div>Sheet Content</div>
        </SheetContent>
      </Sheet>,
    );
    const sheetContent = document.querySelector('[role="dialog"]') as HTMLElement;
    const wrapper = sheetContent?.parentElement as HTMLElement;
    expect(wrapper).toMatchSnapshot();
  });

  it('matches snapshot for SheetContent with top side', () => {
    render(
      <Sheet open={true}>
        <SheetContent side="top">
          <div>Top Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    const sheetContent = document.querySelector('[role="dialog"]') as HTMLElement;
    const wrapper = sheetContent?.parentElement as HTMLElement;
    expect(wrapper).toMatchSnapshot();
  });

  it('matches snapshot for SheetContent with bottom side', () => {
    render(
      <Sheet open={true}>
        <SheetContent side="bottom">
          <div>Bottom Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    const sheetContent = document.querySelector('[role="dialog"]') as HTMLElement;
    const wrapper = sheetContent?.parentElement as HTMLElement;
    expect(wrapper).toMatchSnapshot();
  });

  it('matches snapshot for SheetContent with left side', () => {
    render(
      <Sheet open={true}>
        <SheetContent side="left">
          <div>Left Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    const sheetContent = document.querySelector('[role="dialog"]') as HTMLElement;
    const wrapper = sheetContent?.parentElement as HTMLElement;
    expect(wrapper).toMatchSnapshot();
  });

  it('matches snapshot for SheetContent with right side', () => {
    render(
      <Sheet open={true}>
        <SheetContent side="right">
          <div>Right Sheet</div>
        </SheetContent>
      </Sheet>,
    );
    const sheetContent = document.querySelector('[role="dialog"]') as HTMLElement;
    const wrapper = sheetContent?.parentElement as HTMLElement;
    expect(wrapper).toMatchSnapshot();
  });

  it('matches snapshot for SheetHeader', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    const sheetHeader = document.querySelector('[class*="flex flex-col space-y-2"]');
    expect(sheetHeader).toMatchSnapshot();
  });

  it('matches snapshot for SheetTitle', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetTitle>My Sheet Title</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const sheetTitle = document.querySelector('h2');
    expect(sheetTitle).toMatchSnapshot();
  });

  it('matches snapshot for SheetDescription', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetDescription>My Sheet Description</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const sheetDescription = document.querySelector('p');
    expect(sheetDescription).toMatchSnapshot();
  });

  it('matches snapshot for SheetHeader with Title and Description', () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet Description</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    const sheetHeader = document.querySelector('[class*="flex flex-col space-y-2"]');
    expect(sheetHeader).toMatchSnapshot();
  });
});
