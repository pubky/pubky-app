import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyrightForm } from './CopyrightForm';

// Mock @/libs
vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return {
    ...actual,
    cn: (...inputs: (string | undefined | null | false)[]) => inputs.filter(Boolean).join(' '),
  };
});

// Mock @/molecules
const { mockToast, mockShowErrorToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockShowErrorToast: vi.fn(),
}));
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    toast: mockToast,
    showErrorToast: mockShowErrorToast,
  };
});

// Mock @/atoms - provide minimal mocks for snapshot testing
vi.mock('@/atoms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms')>();
  return {
    ...actual,
  };
});

// Mock fetch
global.fetch = vi.fn();

describe('CopyrightForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Success' }),
    } as Response);
  });

  it('renders with correct title', () => {
    render(<CopyrightForm />);

    expect(screen.getByText('Copyright Removal Request')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<CopyrightForm />);

    expect(screen.getByLabelText(/Name of the rights owner/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Original Content URLs/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Brief description of your original content/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Infringing Content URLs/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Country/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/State\/Province/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zip code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name as Signature/i)).toBeInTheDocument();
  });

  it('renders radio buttons for rights owner selection', () => {
    render(<CopyrightForm />);

    const rightsOwnerRadio = screen.getByLabelText('I am the rights owner');
    const reportingRadio = screen.getByLabelText('I am reporting on behalf of my organization or client');

    expect(rightsOwnerRadio).toHaveAttribute('role', 'radio');
    expect(reportingRadio).toHaveAttribute('role', 'radio');
    // Rights owner is selected by default
    expect(rightsOwnerRadio).toHaveAttribute('aria-checked', 'true');
    expect(reportingRadio).toHaveAttribute('aria-checked', 'false');
  });

  it('validates required fields on submit', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Name of rights owner is required')).toBeInTheDocument();
      expect(screen.getByText('First name is required')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    const emailInput = screen.getByLabelText(/Email/i);
    await user.type(emailInput, 'invalid-email');
    await user.tab(); // Trigger blur validation

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('submits successfully when default role is selected (no role error shown)', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    await user.type(screen.getByLabelText(/Name of the rights owner/i), 'John Doe');
    await user.type(screen.getByLabelText(/Original Content URLs/i), 'https://example.com/original');
    await user.type(screen.getByLabelText(/Brief description/i), 'Description');
    await user.type(screen.getByLabelText(/Infringing Content URLs/i), 'https://example.com/infringing');
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '123-456-7890');
    await user.type(screen.getByLabelText(/Street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/Country/i), 'United States');
    await user.type(screen.getByLabelText(/City/i), 'New York');
    await user.type(screen.getByLabelText(/State\/Province/i), 'NY');
    await user.type(screen.getByLabelText(/Zip code/i), '10001');
    await user.type(screen.getByLabelText(/Full Name as Signature/i), 'John Doe');

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(
      screen.queryByText('Please select if you are the rights owner or reporting on behalf'),
    ).not.toBeInTheDocument();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    // Fill in all required fields
    await user.type(screen.getByLabelText(/Name of the rights owner/i), 'John Doe');
    await user.type(screen.getByLabelText(/Original Content URLs/i), 'https://example.com/original');
    await user.type(screen.getByLabelText(/Brief description/i), 'Original artwork');
    await user.type(screen.getByLabelText(/Infringing Content URLs/i), 'https://example.com/infringing');
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '123-456-7890');
    await user.type(screen.getByLabelText(/Street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/Country/i), 'United States');
    await user.type(screen.getByLabelText(/City/i), 'New York');
    await user.type(screen.getByLabelText(/State\/Province/i), 'NY');
    await user.type(screen.getByLabelText(/Zip code/i), '10001');
    await user.type(screen.getByLabelText(/Full Name as Signature/i), 'John Doe');

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/copyright', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"nameOwner":"John Doe"'),
      });
    });
  });

  it('shows loading state during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ message: 'Success' }),
            } as Response);
          }, 100);
        }),
    );

    render(<CopyrightForm />);

    // Fill minimal required fields
    await user.type(screen.getByLabelText(/Name of the rights owner/i), 'John Doe');
    await user.type(screen.getByLabelText(/Original Content URLs/i), 'https://example.com/original');
    await user.type(screen.getByLabelText(/Brief description/i), 'Description');
    await user.type(screen.getByLabelText(/Infringing Content URLs/i), 'https://example.com/infringing');
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '123-456-7890');
    await user.type(screen.getByLabelText(/Street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/Country/i), 'United States');
    await user.type(screen.getByLabelText(/City/i), 'New York');
    await user.type(screen.getByLabelText(/State\/Province/i), 'NY');
    await user.type(screen.getByLabelText(/Zip code/i), '10001');
    await user.type(screen.getByLabelText(/Full Name as Signature/i), 'John Doe');

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    // The button text changes to "Submitting..." when loading
    expect(screen.getByText('Submitting...')).toBeInTheDocument();
  });

  it('shows success toast on successful submission', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    // Fill all required fields
    await user.type(screen.getByLabelText(/Name of the rights owner/i), 'John Doe');
    await user.type(screen.getByLabelText(/Original Content URLs/i), 'https://example.com/original');
    await user.type(screen.getByLabelText(/Brief description/i), 'Description');
    await user.type(screen.getByLabelText(/Infringing Content URLs/i), 'https://example.com/infringing');
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '123-456-7890');
    await user.type(screen.getByLabelText(/Street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/Country/i), 'United States');
    await user.type(screen.getByLabelText(/City/i), 'New York');
    await user.type(screen.getByLabelText(/State\/Province/i), 'NY');
    await user.type(screen.getByLabelText(/Zip code/i), '10001');
    await user.type(screen.getByLabelText(/Full Name as Signature/i), 'John Doe');

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Request sent successfully',
      });
    });
  });

  it('shows error toast on failed submission', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Validation failed' }),
    } as Response);

    render(<CopyrightForm />);

    // Fill all required fields
    await user.type(screen.getByLabelText(/Name of the rights owner/i), 'John Doe');
    await user.type(screen.getByLabelText(/Original Content URLs/i), 'https://example.com/original');
    await user.type(screen.getByLabelText(/Brief description/i), 'Description');
    await user.type(screen.getByLabelText(/Infringing Content URLs/i), 'https://example.com/infringing');
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone number/i), '123-456-7890');
    await user.type(screen.getByLabelText(/Street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/Country/i), 'United States');
    await user.type(screen.getByLabelText(/City/i), 'New York');
    await user.type(screen.getByLabelText(/State\/Province/i), 'NY');
    await user.type(screen.getByLabelText(/Zip code/i), '10001');
    await user.type(screen.getByLabelText(/Full Name as Signature/i), 'John Doe');

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockShowErrorToast).toHaveBeenCalledWith({
        description: 'Validation failed',
      });
    });
  });

  it('handles radio selection correctly with mutual exclusivity', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    const rightsOwnerRadio = screen.getByLabelText('I am the rights owner');
    const reportingOnBehalfRadio = screen.getByLabelText('I am reporting on behalf of my organization or client');

    // Initially, rights owner is selected
    expect(rightsOwnerRadio).toHaveAttribute('aria-checked', 'true');
    expect(reportingOnBehalfRadio).toHaveAttribute('aria-checked', 'false');

    // Click reporting on behalf - rights owner deselects automatically
    await user.click(reportingOnBehalfRadio);
    expect(reportingOnBehalfRadio).toHaveAttribute('aria-checked', 'true');
    expect(rightsOwnerRadio).toHaveAttribute('aria-checked', 'false');

    // Click rights owner - reporting deselects automatically
    await user.click(rightsOwnerRadio);
    expect(rightsOwnerRadio).toHaveAttribute('aria-checked', 'true');
    expect(reportingOnBehalfRadio).toHaveAttribute('aria-checked', 'false');
  });

  it('resets form after successful submission', async () => {
    const user = userEvent.setup();
    render(<CopyrightForm />);

    // Fill all required fields
    await user.type(screen.getByLabelText(/Name of the rights owner/i), 'John Doe');
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Phone number/i), '123-456-7890');
    await user.type(screen.getByLabelText(/Street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/Country/i), 'United States');
    await user.type(screen.getByLabelText(/City/i), 'New York');
    await user.type(screen.getByLabelText(/State\/Province/i), 'NY');
    await user.type(screen.getByLabelText(/Zip code/i), '10001');
    await user.type(screen.getByLabelText(/Original Content URLs/i), 'https://example.com/original');
    await user.type(screen.getByLabelText(/Brief description/i), 'Description');
    await user.type(screen.getByLabelText(/Infringing Content URLs/i), 'https://example.com/infringing');
    await user.type(screen.getByLabelText(/Full Name as Signature/i), 'John Doe');

    const submitButton = screen.getByRole('button', { name: 'Submit Form' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });

    // Form should be reset
    expect(screen.getByLabelText(/Name of the rights owner/i)).toHaveValue('');
    expect(screen.getByLabelText(/Email/i)).toHaveValue('');
  });

  it('renders form element with onSubmit', () => {
    render(<CopyrightForm />);

    const form = document.querySelector('form');
    expect(form).toBeInTheDocument();
  });
});

describe('CopyrightForm - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the date to ensure consistent snapshots
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches snapshot for default state', () => {
    const { container } = render(<CopyrightForm />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
