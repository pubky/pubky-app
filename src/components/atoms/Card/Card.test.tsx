import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

describe('Card', () => {
  it('renders complete card structure', () => {
    render(
      <Card data-testid="complete-card">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Card Content</CardContent>
        <CardFooter>Card Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('complete-card')).toBeInTheDocument();
    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Description')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Card Content')).toBeInTheDocument();
    expect(screen.getByText('Card Footer')).toBeInTheDocument();
  });
});

describe('Card - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Card>Card content</Card>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Card className="custom-card">Custom Card</Card>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for CardHeader', () => {
    const { container } = render(<CardHeader>Header Content</CardHeader>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for CardTitle', () => {
    const { container } = render(<CardTitle>Card Title</CardTitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for CardDescription', () => {
    const { container } = render(<CardDescription>Card Description</CardDescription>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for CardContent', () => {
    const { container } = render(<CardContent>Card Content</CardContent>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for CardFooter', () => {
    const { container } = render(<CardFooter>Card Footer</CardFooter>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for CardAction', () => {
    const { container } = render(<CardAction>Action</CardAction>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for complete card structure', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Card Content</CardContent>
        <CardFooter>Card Footer</CardFooter>
      </Card>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for minimal card structure', () => {
    const { container } = render(
      <Card>
        <CardContent>Minimal Content</CardContent>
      </Card>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
