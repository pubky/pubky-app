import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SettingsInfo } from './SettingsInfo';

describe('SettingsInfo', () => {
  it('renders without crashing', () => {
    const { container } = render(<SettingsInfo />);
    expect(container).toBeTruthy();
  });

  it('renders all section headers', () => {
    render(<SettingsInfo />);

    expect(screen.getByText('Terms of Service & Privacy')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
  });

  it('renders subtitle for Terms section', () => {
    render(<SettingsInfo />);
    expect(screen.getByText('Please read our terms carefully.')).toBeInTheDocument();
  });

  it('renders copyright text', () => {
    render(<SettingsInfo />);
    expect(screen.getByText(/© 2026 Synonym Software/)).toBeInTheDocument();
  });
});

describe('SettingsInfo - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<SettingsInfo />);
    expect(container).toMatchSnapshot();
  });
});
