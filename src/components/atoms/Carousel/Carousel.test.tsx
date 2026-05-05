import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import useEmblaCarousel from 'embla-carousel-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './Carousel';

// Mock embla-carousel-react
const mockScrollPrev = vi.fn();
const mockScrollNext = vi.fn();
const mockCanScrollPrev = vi.fn(() => true);
const mockCanScrollNext = vi.fn(() => true);
const mockOn = vi.fn();
const mockOff = vi.fn();

const mockApi = {
  scrollPrev: mockScrollPrev,
  scrollNext: mockScrollNext,
  canScrollPrev: mockCanScrollPrev,
  canScrollNext: mockCanScrollNext,
  on: mockOn,
  off: mockOff,
};

vi.mock('embla-carousel-react', () => ({
  default: vi.fn(() => [vi.fn(), mockApi]),
}));

describe('Carousel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanScrollPrev.mockReturnValue(true);
    mockCanScrollNext.mockReturnValue(true);
  });

  it('renders with default props', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const carousel = screen.getByRole('region');
    expect(carousel).toBeInTheDocument();
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
    expect(carousel).toHaveAttribute('data-slot', 'carousel');
  });

  it('renders carousel content with correct structure', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
          <CarouselItem>Slide 2</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const content = screen.getByText('Slide 1').parentElement?.parentElement;
    expect(content).toHaveAttribute('data-slot', 'carousel-content');
  });

  it('renders carousel items with correct accessibility attributes', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const item = screen.getByText('Slide 1');
    expect(item).toHaveAttribute('role', 'group');
    expect(item).toHaveAttribute('aria-roledescription', 'slide');
    expect(item).toHaveAttribute('data-slot', 'carousel-item');
  });

  it('renders navigation buttons', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    expect(screen.getByRole('button', { name: /previous slide/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next slide/i })).toBeInTheDocument();
  });

  it('handles previous button click', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>,
    );

    const prevButton = screen.getByRole('button', { name: /previous slide/i });
    fireEvent.click(prevButton);

    expect(mockScrollPrev).toHaveBeenCalledTimes(1);
  });

  it('handles next button click', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>,
    );

    const nextButton = screen.getByRole('button', { name: /next slide/i });
    fireEvent.click(nextButton);

    expect(mockScrollNext).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard navigation with ArrowLeft', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const carousel = screen.getByRole('region');
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' });

    expect(mockScrollPrev).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard navigation with ArrowRight', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const carousel = screen.getByRole('region');
    fireEvent.keyDown(carousel, { key: 'ArrowRight' });

    expect(mockScrollNext).toHaveBeenCalledTimes(1);
  });

  it('disables previous button when cannot scroll prev', () => {
    mockCanScrollPrev.mockReturnValue(false);

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>,
    );

    const prevButton = screen.getByRole('button', { name: /previous slide/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables next button when cannot scroll next', () => {
    mockCanScrollNext.mockReturnValue(false);

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>,
    );

    const nextButton = screen.getByRole('button', { name: /next slide/i });
    expect(nextButton).toBeDisabled();
  });

  it('accepts custom className on Carousel', () => {
    render(
      <Carousel className="custom-carousel-class">
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const carousel = screen.getByRole('region');
    expect(carousel).toHaveClass('custom-carousel-class');
  });

  it('accepts custom className on CarouselContent', () => {
    render(
      <Carousel>
        <CarouselContent className="custom-content-class">
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const content = screen.getByText('Slide 1').parentElement;
    expect(content).toHaveClass('custom-content-class');
  });

  it('accepts custom className on CarouselItem', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem className="custom-item-class">Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const item = screen.getByText('Slide 1');
    expect(item).toHaveClass('custom-item-class');
  });

  it('passes options to embla carousel', () => {
    const opts = { loop: true, align: 'start' as const };

    render(
      <Carousel opts={opts}>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(useEmblaCarousel).toHaveBeenCalledWith(
      expect.objectContaining({ loop: true, align: 'start', axis: 'x' }),
      undefined,
    );
  });

  it('sets vertical axis when orientation is vertical', () => {
    render(
      <Carousel orientation="vertical">
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(useEmblaCarousel).toHaveBeenCalledWith(expect.objectContaining({ axis: 'y' }), undefined);
  });

  it('calls setApi when api is available', () => {
    const setApiMock = vi.fn();

    render(
      <Carousel setApi={setApiMock}>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(setApiMock).toHaveBeenCalledWith(mockApi);
  });

  it('registers event listeners on mount', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(mockOn).toHaveBeenCalledWith('reInit', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('select', expect.any(Function));
  });

  it('throws error when useCarousel is used outside Carousel', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<CarouselContent>Content</CarouselContent>);
    }).toThrow('useCarousel must be used within a <Carousel />');

    consoleSpy.mockRestore();
  });
});

describe('Carousel - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanScrollPrev.mockReturnValue(true);
    mockCanScrollNext.mockReturnValue(true);
  });

  it('matches snapshot with default props', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple slides', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
          <CarouselItem>Slide 2</CarouselItem>
          <CarouselItem>Slide 3</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with navigation buttons', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for horizontal orientation', () => {
    const { container } = render(
      <Carousel orientation="horizontal">
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for vertical orientation', () => {
    const { container } = render(
      <Carousel orientation="vertical">
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className on Carousel', () => {
    const { container } = render(
      <Carousel className="custom-carousel">
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className on CarouselContent', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent className="custom-content">
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className on CarouselItem', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem className="custom-item">Slide 1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled previous button', () => {
    mockCanScrollPrev.mockReturnValue(false);

    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled next button', () => {
    mockCanScrollNext.mockReturnValue(false);

    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both navigation buttons disabled', () => {
    mockCanScrollPrev.mockReturnValue(false);
    mockCanScrollNext.mockReturnValue(false);

    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom button variants', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious variant="outline" />
        <CarouselNext variant="outline" />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom button sizes', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious size="sm" />
        <CarouselNext size="sm" />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex slide content', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>
            <div className="p-4">
              <h3>Card Title</h3>
              <p>Card description</p>
            </div>
          </CarouselItem>
          <CarouselItem>
            <div className="p-4">
              <img src="image.jpg" alt="Image" />
            </div>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
