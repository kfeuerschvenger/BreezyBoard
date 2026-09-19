import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateBoardModal from './CreateBoardModal';
import { ColorService, TemplateService } from '@/services';
import type { Color, Template } from '@/models';

// Written before the migration onto the shared Modal and React Hook Form,
// deliberately, and against the implementation that was already there.
//
// The draft persistence in this component is three effects whose ordering
// is load bearing and explained only in comments: restore once per open,
// after the defaults land; autosave only after that restore has had its
// turn; clear only once a submit has happened and the modal has since
// closed. Every one of those is a trap somebody already fell into. A
// rewrite that quietly loses one of them would look entirely fine, which is
// exactly why the behaviour is pinned here first rather than afterwards.

vi.mock('@/services', () => ({
  ColorService: { getByType: vi.fn() },
  TemplateService: { getAll: vi.fn() },
}));

const mockedColorService = vi.mocked(ColorService);
const mockedTemplateService = vi.mocked(TemplateService);

const COLORS: Color[] = [
  { _id: 'color-blue', name: 'Royal Blue', value: '#0052CC' },
  { _id: 'color-green', name: 'Emerald', value: '#2F9E44' },
];

const TEMPLATES: Template[] = [
  {
    _id: 'template-kanban',
    name: 'Kanban Board',
    description: 'Columns with drag and drop',
    iconName: 'Folder',
    columns: [],
  },
  {
    _id: 'template-sprint',
    name: 'Sprint Board',
    description: 'Two week cycles',
    iconName: 'Calendar',
    columns: [],
  },
];

const DRAFT_KEY = 'breezyboard:draft:board:new';

beforeEach(() => {
  mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
  mockedTemplateService.getAll.mockReset().mockResolvedValue(TEMPLATES);
});

afterEach(() => {
  window.localStorage.clear();
});

const open = (onCreateBoard = vi.fn(), onClose = vi.fn()) => {
  const view = render(<CreateBoardModal open onClose={onClose} onCreateBoard={onCreateBoard} />);
  return { ...view, onCreateBoard, onClose };
};

const titleBox = () => screen.getByPlaceholderText('Enter board name');
const submit = () => screen.getByRole('button', { name: /create board/i });

// useDraft wraps the value in a { savedAt, value } envelope, so a test that
// reads the raw entry and expects the form object back passes only by
// accident.
const storedDraft = () => {
  const raw = window.localStorage.getItem(DRAFT_KEY);
  return raw ? JSON.parse(raw).value : null;
};

interface BoardDraft {
  title: string;
  description: string;
  color: string;
  template: string;
}

const storeDraft = (value: BoardDraft) =>
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), value }));

describe('CreateBoardModal', () => {
  it('cannot be submitted until it has a name', async () => {
    const user = userEvent.setup();
    open();

    await waitFor(() => expect(submit()).toBeDisabled());

    await user.type(titleBox(), 'Launch plan');

    expect(submit()).toBeEnabled();
  });

  it('hands the parent what was filled in', async () => {
    const user = userEvent.setup();
    const { onCreateBoard } = open();

    await waitFor(() => expect(titleBox()).toBeInTheDocument());
    await user.type(titleBox(), 'Launch plan');
    await user.type(screen.getByPlaceholderText(/describe/i), 'Everything for the launch');
    await user.click(submit());

    expect(onCreateBoard).toHaveBeenCalledTimes(1);
    expect(onCreateBoard.mock.calls[0][0]).toMatchObject({
      title: 'Launch plan',
      description: 'Everything for the launch',
    });
  });

  it('defaults to the first colour and template once they arrive', async () => {
    const user = userEvent.setup();
    const { onCreateBoard } = open();

    await waitFor(() => expect(screen.getByText('Kanban Board')).toBeInTheDocument());
    await user.type(titleBox(), 'Launch plan');
    await user.click(submit());

    expect(onCreateBoard.mock.calls[0][0]).toMatchObject({
      color: 'color-blue',
      template: 'template-kanban',
    });
  });

  it('sends the colour and template the user picked instead', async () => {
    const user = userEvent.setup();
    const { onCreateBoard } = open();

    await waitFor(() => expect(screen.getByText('Sprint Board')).toBeInTheDocument());
    await user.type(titleBox(), 'Launch plan');
    await user.click(screen.getByText('Emerald'));
    await user.click(screen.getByText('Sprint Board'));
    await user.click(submit());

    expect(onCreateBoard.mock.calls[0][0]).toMatchObject({
      color: 'color-green',
      template: 'template-sprint',
    });
  });

  describe('draft persistence', () => {
    it('keeps what was typed so losing the page does not lose the work', async () => {
      const user = userEvent.setup();
      open();

      await waitFor(() => expect(titleBox()).toBeInTheDocument());
      await user.type(titleBox(), 'Half written');

      await waitFor(() => expect(storedDraft()).toMatchObject({ title: 'Half written' }));
    });

    it('restores that draft the next time it opens', async () => {
      storeDraft({ title: 'From yesterday', description: 'Still here', color: 'color-green', template: 'template-sprint' });

      open();

      await waitFor(() => expect(titleBox()).toHaveValue('From yesterday'));
      expect(screen.getByPlaceholderText(/describe/i)).toHaveValue('Still here');
    });

    it('does not let the defaults overwrite the restored draft', async () => {
      // The colour and template defaults land on the same loading transition
      // as the restore. Applied in the wrong order they silently replace a
      // choice the user already made.
      storeDraft({ title: 'From yesterday', description: '', color: 'color-green', template: 'template-sprint' });

      const user = userEvent.setup();
      const { onCreateBoard } = open();

      await waitFor(() => expect(titleBox()).toHaveValue('From yesterday'));
      await user.click(submit());

      expect(onCreateBoard.mock.calls[0][0]).toMatchObject({
        color: 'color-green',
        template: 'template-sprint',
      });
    });

    it('never writes an empty snapshot over a draft that has not been restored yet', async () => {
      // The documented trap: the autosave effect also fires the instant the
      // modal opens, before the async colour and template fetch resolves. If
      // it writes then, the restore that follows reads back the empty
      // snapshot it just wrote and wipes the real draft.
      storeDraft({ title: 'Must survive', description: '', color: 'color-blue', template: 'template-kanban' });

      open();

      await waitFor(() => expect(titleBox()).toHaveValue('Must survive'));
      expect(storedDraft()).toMatchObject({ title: 'Must survive' });
    });

    it('clears the draft once the board has been created and the modal has closed', async () => {
      const user = userEvent.setup();
      const onCreateBoard = vi.fn();
      const { rerender } = render(<CreateBoardModal open onClose={vi.fn()} onCreateBoard={onCreateBoard} />);

      await waitFor(() => expect(titleBox()).toBeInTheDocument());
      await user.type(titleBox(), 'Launch plan');
      await user.click(submit());

      // The parent closes the modal on success and leaves it open on
      // failure, so "submitted, then closed" is the only success signal this
      // component gets.
      rerender(<CreateBoardModal open={false} onClose={vi.fn()} onCreateBoard={onCreateBoard} />);

      await waitFor(() => expect(storedDraft()).toBeNull());
    });

    it('keeps the draft when the modal is closed without submitting', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<CreateBoardModal open onClose={vi.fn()} onCreateBoard={vi.fn()} />);

      await waitFor(() => expect(titleBox()).toBeInTheDocument());
      await user.type(titleBox(), 'Changed my mind');
      await waitFor(() => expect(storedDraft()).toMatchObject({ title: 'Changed my mind' }));

      rerender(<CreateBoardModal open={false} onClose={vi.fn()} onCreateBoard={vi.fn()} />);

      expect(storedDraft()).toMatchObject({ title: 'Changed my mind' });
    });
  });
});
