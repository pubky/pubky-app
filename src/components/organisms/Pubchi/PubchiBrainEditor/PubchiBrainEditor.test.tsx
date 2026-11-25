import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_BRAIN_EDITOR_SURFACE, PubchiBrainEditor } from './PubchiBrainEditor';

vi.mock('@/organisms/RingApprovalDialog/RingApprovalDialog', () => ({
  RingApprovalDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="ring-approval-dialog" /> : null),
}));

describe('PubchiBrainEditor', () => {
  it('explains private brain context and previews typed rules', () => {
    render(
      <PubchiBrainEditor
        context={{
          schema: 'pubchi-owner-context',
          version: 1,
          about: 'Bitcoin developer',
          instructions: 'Two sentences max.',
          updated_at: 1,
        }}
        contextEditable
        onSaveContext={vi.fn()}
      />,
    );

    expect(screen.getByTestId(PUBCHI_BRAIN_EDITOR_SURFACE)).toHaveAttribute(
      'data-surface',
      PUBCHI_BRAIN_EDITOR_SURFACE,
    );
    expect(screen.getByText(/reads these before every answer/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /stored in your homeserver's private area.*influence answers, contextual tag suggestions, and feed building/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-brain-preview')).toHaveTextContent('I’ll keep this to two sentences.');
    expect(screen.getByPlaceholderText(/Bitcoin developer in Lisbon/)).toBeInTheDocument();
  });

  it('shows the gate while keeping current values read-only', () => {
    const onReapprove = vi.fn();
    render(
      <PubchiBrainEditor
        context={{
          schema: 'pubchi-owner-context',
          version: 1,
          about: 'Existing context',
          instructions: 'Be concise',
          updated_at: 1,
        }}
        contextEditable={false}
        onReapprove={onReapprove}
      />,
    );

    expect(screen.getByTestId('pubchi-brain-gate')).toHaveTextContent("doesn't include the private Pubchi folder");
    expect(screen.getByLabelText('About you')).toHaveValue('Existing context');
    expect(screen.getByLabelText('About you')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve in Ring' }));
    expect(screen.getByTestId('ring-approval-dialog')).toBeInTheDocument();
    expect(onReapprove).not.toHaveBeenCalled();
  });

  it('places guidance under each field and the preview above Save', () => {
    render(
      <PubchiBrainEditor
        context={{ schema: 'pubchi-owner-context', version: 1, about: '', instructions: '', updated_at: 1 }}
        contextEditable
        onSaveContext={vi.fn()}
      />,
    );

    expect(
      screen.getByText('A few lines about you (role, interests). Used to personalise answers.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Style rules for replies (tone, length, language).')).toBeInTheDocument();

    const editor = screen.getByTestId(PUBCHI_BRAIN_EDITOR_SURFACE);
    const about = screen.getByLabelText('About you');
    const instructions = screen.getByLabelText('How to answer');
    const preview = screen.getByTestId('pubchi-brain-preview');
    const save = screen.getByRole('button', { name: 'Save private context' });

    expect(about.compareDocumentPosition(instructions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(instructions.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(editor).toContainElement(preview);
  });
});
