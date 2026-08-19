import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfilePageLayoutWrapper } from './ProfilePageLayoutWrapper';

describe('ProfilePageLayoutWrapper', () => {
  it('renders children correctly', () => {
    render(
      <ProfilePageLayoutWrapper>
        <div>Test Content</div>
      </ProfilePageLayoutWrapper>,
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('has correct responsive max-width classes', () => {
    const { container } = render(
      <ProfilePageLayoutWrapper>
        <div>Test</div>
      </ProfilePageLayoutWrapper>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('max-w-(--container-max-width)');
  });

  it('has correct layout classes', () => {
    const { container } = render(
      <ProfilePageLayoutWrapper>
        <div>Test</div>
      </ProfilePageLayoutWrapper>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('mx-auto', 'w-full');
  });

  it('keeps mobile spacing but removes the extra desktop top margin', () => {
    const { container } = render(
      <ProfilePageLayoutWrapper>
        <div>Test</div>
      </ProfilePageLayoutWrapper>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('mt-6', 'lg:mt-0');
  });

  it('has correct padding classes', () => {
    const { container } = render(
      <ProfilePageLayoutWrapper>
        <div>Test</div>
      </ProfilePageLayoutWrapper>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('px-6', 'xl:px-0', 'pt-0');
  });

  it('matches snapshot', () => {
    const { container } = render(
      <ProfilePageLayoutWrapper>
        <div>Test Content</div>
      </ProfilePageLayoutWrapper>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
