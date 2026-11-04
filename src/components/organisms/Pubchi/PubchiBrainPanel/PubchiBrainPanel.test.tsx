import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_BRAIN_PANEL_SURFACE, PubchiBrainPanel } from './PubchiBrainPanel';

const hosted = {
  execution: 'synonym-hosted' as const,
  provider_id: 'moonshot' as const,
  model_id: 'kimi-k3' as const,
  endpoint: null,
};

describe('PubchiBrainPanel', () => {
  it('selects the hosted default and shows the identity copy', () => {
    render(<PubchiBrainPanel value={hosted} onChange={vi.fn()} />);

    expect(screen.getByTestId(PUBCHI_BRAIN_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_BRAIN_PANEL_SURFACE);
    expect(screen.getByLabelText('Pubchi brain')).toBeInTheDocument();
    expect(screen.getByLabelText('Kimi K3, hosted by Synonym (default)')).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText(
        "Your Pubchi's identity, settings, and history live on your homeserver. Changing the brain changes how it thinks, not who it is.",
      ),
    ).toBeInTheDocument();
  });

  it('reveals self-hosted fields when selected', () => {
    const onChange = vi.fn();
    render(<PubchiBrainPanel value={hosted} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('My own endpoint'));

    expect(screen.getByLabelText('Endpoint URL')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'http://localhost:11434/v1' } });
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: 'local-model' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({
      execution: 'self-hosted',
      provider_id: 'openai-compatible',
      model_id: 'local-model',
      endpoint: 'http://localhost:11434/v1',
    });
  });

  it('switches back to hosted and hides self-hosted fields', () => {
    const onChange = vi.fn();
    render(
      <PubchiBrainPanel
        value={{
          execution: 'self-hosted',
          provider_id: 'openai-compatible',
          model_id: 'local-model',
          endpoint: 'http://localhost:11434/v1',
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Kimi K3, hosted by Synonym (default)'));
    expect(screen.queryByLabelText('Endpoint URL')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(hosted);
  });

  it('rejects credentials in endpoint URLs with the exact warning', () => {
    const onChange = vi.fn();
    render(
      <PubchiBrainPanel
        value={{
          execution: 'self-hosted',
          provider_id: 'openai-compatible',
          model_id: 'kimi-k3',
          endpoint: 'http://localhost:11434',
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'http://user:pass@localhost:11434/v1' },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Endpoint URL')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/without credentials, query parameters, or fragments/)).toBeInTheDocument();
  });

  it.each([
    'https://example.com/v1',
    'http://127.0.0.2/v1',
    'http://localhost.example.com/v1',
    'http://localhost:11434/v1?model=local',
    'http://localhost:11434/v1#settings',
    'http://localhost:11434/' + 'x'.repeat(2048),
  ])('blocks endpoints the Pubchi service rejects: %s', (endpoint) => {
    render(
      <PubchiBrainPanel
        value={{
          execution: 'self-hosted',
          provider_id: 'ollama',
          model_id: 'local',
          endpoint: 'http://localhost:11434',
        }}
        onChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: endpoint } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('Endpoint URL')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each(['http://localhost:11434', 'https://127.0.0.1:8443/v1', 'http://[::1]:11434'])(
    'allows service loopback endpoint %s',
    (endpoint) => {
      const onChange = vi.fn();
      render(
        <PubchiBrainPanel
          value={{ execution: 'self-hosted', provider_id: 'ollama', model_id: 'local', endpoint: '' }}
          onChange={onChange}
        />,
      );
      fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: endpoint } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ endpoint }));
      expect(screen.getByText(/reached from the Pubchi service host, not your browser/)).toBeInTheDocument();
    },
  );

  it('keeps an incomplete URL editable while preventing Save', () => {
    render(
      <PubchiBrainPanel
        value={{ execution: 'self-hosted', provider_id: 'ollama', model_id: 'local', endpoint: '' }}
        onChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'http://' } });
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('http://');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows rollback when a previous brain is provided', () => {
    const onRollback = vi.fn();
    render(
      <PubchiBrainPanel
        value={hosted}
        previous={{
          execution: 'self-hosted',
          provider_id: 'ollama',
          model_id: 'local',
          endpoint: 'http://localhost:11434',
        }}
        onChange={vi.fn()}
        onRollback={onRollback}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Roll back to previous brain' }));
    expect(onRollback).toHaveBeenCalledOnce();
  });
});
