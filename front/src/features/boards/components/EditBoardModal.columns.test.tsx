import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { axe } from 'vitest-axe';
import { renderWithQuery } from '@/test/renderWithQuery';
import { ColorService } from '@/services';
import type { Board, Color, Column } from '@/models';
import { EditBoardModal } from './EditBoardModal';
import type { EditBoardSave } from './EditBoardModal';

vi.mock('@/services', () => ({
  ColorService: { getByType: vi.fn() },
}));

const mockedColorService = vi.mocked(ColorService);

const HUES = ['sky', 'teal', 'green', 'sand', 'coral', 'lavender'] as const;
const COLORS: Color[] = HUES.map(hue => ({ _id: `c-${hue}`, name: hue[0].toUpperCase() + hue.slice(1), value: hue }));

const column = (id: string, title: string, hue: (typeof HUES)[number], order: number): Column => ({
  _id: id,
  title,
  color: COLORS.find(color => color.value === hue) as Color,
  order,
});

const COLUMNS: Column[] = [
  column('col-backlog', 'Backlog', 'sky', 0),
  column('col-doing', 'Doing', 'sand', 1),
  column('col-done', 'Done', 'green', 2),
];

const BOARD: Pick<Board, 'title' | 'description' | 'color'> & { columns: Column[] } = {
  title: 'Launch Plan',
  description: 'Everything for the launch',
  color: COLORS[0],
  columns: COLUMNS,
};

beforeEach(() => {
  mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
});

interface RenderOptions {
  columns?: Column[];
  counts?: Record<string, number>;
  onSave?: (values: EditBoardSave) => Promise<void>;
  focusColumns?: boolean;
}

const renderModal = ({ columns = COLUMNS, counts = {}, onSave, focusColumns }: RenderOptions = {}) => {
  const save = onSave ?? vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const element = (open: boolean) => (
    <EditBoardModal
      open={open}
      board={{ ...BOARD, columns }}
      taskCounts={counts}
      focusColumns={focusColumns}
      onClose={onClose}
      onSave={save}
    />
  );
  const view = renderWithQuery(element(true));
  return { ...view, onSave: save as ReturnType<typeof vi.fn>, onClose, element };
};

const ready = () => screen.findByRole('textbox', { name: 'Name of column 1' });
const nameOf = (position: number) => screen.getByRole('textbox', { name: `Name of column ${position}` });
const names = () =>
  screen.getAllByRole('textbox', { name: /^Name of column \d+$/ }).map(box => (box as HTMLInputElement).value);
const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });
const addSection = () => screen.getByRole('group', { name: 'Add a column' });
// The dialog's own live region, which says what an add, a move or a removal did.
const announcement = () => within(screen.getByRole('dialog')).getByRole('status');

const lastPayload = (onSave: ReturnType<typeof vi.fn>) => onSave.mock.calls.at(-1)?.[0] as EditBoardSave;

const rejectedWith = (status: number, message: string) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message },
  });

describe('EditBoardModal, columns', () => {
  it('lists the columns in order with their names, and says the last one counts as landed', async () => {
    renderModal();
    await ready();

    expect(names()).toEqual(['Backlog', 'Doing', 'Done']);
    const landed = screen.getAllByText('Cards in this column count as landed.');
    expect(landed).toHaveLength(1);
    expect(landed[0].closest('li')).toContainElement(nameOf(3));
  });

  it('offers the six hues on every row, with the column\'s own chosen', async () => {
    renderModal();
    await ready();

    const doing = screen.getByRole('group', { name: 'Colour of Doing' });

    expect(within(doing).getAllByRole('radio')).toHaveLength(6);
    expect(within(doing).getByRole('radio', { name: 'Sand' })).toBeChecked();
  });

  it('has no columns section when the board is given without columns', async () => {
    renderWithQuery(<EditBoardModal open board={{ title: 'A', description: '', color: COLORS[0] }} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByRole('radio', { name: 'Sky' });

    expect(screen.queryByRole('heading', { name: 'Columns' })).not.toBeInTheDocument();
  });

  describe('adding', () => {
    const addColumn = async (name: string) => {
      await userEvent.type(within(addSection()).getByRole('textbox', { name: 'New column name' }), name);
      await userEvent.click(within(addSection()).getByRole('button', { name: 'Add column' }));
    };

    it('puts a new column before the last one unless told otherwise, so the column where work lands stays last', async () => {
      renderModal();
      await ready();

      await addColumn('Review');

      expect(names()).toEqual(['Backlog', 'Doing', 'Review', 'Done']);
    });

    it.each([
      ['first', 'First, before Backlog', ['Review', 'Backlog', 'Doing', 'Done']],
      ['between two named columns', 'Between Backlog and Doing', ['Backlog', 'Review', 'Doing', 'Done']],
      ['last', 'Last, after Done', ['Backlog', 'Doing', 'Done', 'Review']],
    ])('adds a column %s', async (_label, position, expected) => {
      renderModal();
      await ready();

      await userEvent.selectOptions(within(addSection()).getByRole('combobox', { name: 'Position' }), position);
      await addColumn('Review');

      expect(names()).toEqual(expected);
    });

    it('starts the new column on the next hue of the reference cycle, and saves the one chosen instead', async () => {
      const { onSave } = renderModal();
      await ready();

      // Three columns, so the fourth hue of the cycle: teal.
      expect(within(addSection()).getByRole('radio', { name: 'Teal' })).toBeChecked();
      await userEvent.click(within(addSection()).getByRole('radio', { name: 'Lavender' }));
      await addColumn('Review');
      await userEvent.click(saveButton());

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(lastPayload(onSave).columns?.[2]).toEqual({ title: 'Review', color: 'c-lavender' });
    });

    it('adds on Enter without saving the dialog', async () => {
      const { onSave } = renderModal();
      await ready();

      await userEvent.type(within(addSection()).getByRole('textbox', { name: 'New column name' }), 'Review{Enter}');

      expect(names()).toContain('Review');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('empties the field, keeps the cursor in it and says what was added', async () => {
      renderModal();
      await ready();

      await addColumn('Review');

      const field = within(addSection()).getByRole('textbox', { name: 'New column name' });
      expect(field).toHaveValue('');
      expect(field).toHaveFocus();
      expect(announcement()).toHaveTextContent('Added Review as column 3 of 4.');
    });

    it.each([
      ['an empty name', '', 'A column needs a name'],
      ['a name another column has, in other letters', 'DOING', 'Another column already has that name'],
      ['a name of 41 characters', 'a'.repeat(41), 'A column name is at most 40 characters'],
    ])('refuses %s and adds nothing', async (_label, name, message) => {
      renderModal();
      await ready();

      if (name) await userEvent.type(within(addSection()).getByRole('textbox', { name: 'New column name' }), name);
      await userEvent.click(within(addSection()).getByRole('button', { name: 'Add column' }));

      expect(within(addSection()).getByRole('alert')).toHaveTextContent(message);
      expect(names()).toEqual(['Backlog', 'Doing', 'Done']);
    });

    it('stops at 8 columns and says why', async () => {
      const eight = Array.from({ length: 8 }, (_, index) => column(`c${index}`, `Column ${index}`, 'sky', index));
      renderModal({ columns: eight });
      await ready();

      expect(within(addSection()).getByRole('button', { name: 'Add column' })).toBeDisabled();
      expect(within(addSection()).getByRole('textbox', { name: 'New column name' })).toBeDisabled();
      expect(screen.getByText('A board has at most 8 columns.')).toBeInTheDocument();
    });
  });

  describe('renaming and recolouring', () => {
    it('sends the renamed column with its id, in the same request as the board fields', async () => {
      const { onSave } = renderModal();
      await ready();

      await userEvent.clear(nameOf(2));
      await userEvent.type(nameOf(2), '  In progress ');
      await userEvent.clear(screen.getByRole('textbox', { name: /board name/i }));
      await userEvent.type(screen.getByRole('textbox', { name: /board name/i }), 'Relaunch');
      await userEvent.click(saveButton());

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(lastPayload(onSave)).toEqual({
        title: 'Relaunch',
        description: 'Everything for the launch',
        color: 'c-sky',
        columns: [
          { _id: 'col-backlog', title: 'Backlog', color: 'c-sky' },
          { _id: 'col-doing', title: 'In progress', color: 'c-sand' },
          { _id: 'col-done', title: 'Done', color: 'c-green' },
        ],
      });
    });

    it('sends the new hue of a recoloured column', async () => {
      const { onSave } = renderModal();
      await ready();

      await userEvent.click(within(screen.getByRole('group', { name: 'Colour of Backlog' })).getByRole('radio', { name: 'Coral' }));
      await userEvent.click(saveButton());

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(lastPayload(onSave).columns?.[0]).toEqual({ _id: 'col-backlog', title: 'Backlog', color: 'c-coral' });
    });

    it('refuses two columns with the same name, says which, and cannot be saved', async () => {
      renderModal();
      await ready();

      await userEvent.clear(nameOf(2));
      await userEvent.type(nameOf(2), 'backlog');

      expect(await screen.findByText('Two columns cannot have the same name')).toBeInTheDocument();
      expect(nameOf(2)).toBeInvalid();
      expect(saveButton()).toBeDisabled();
    });

    it('refuses an empty name and one over 40 characters', async () => {
      renderModal();
      await ready();

      await userEvent.clear(nameOf(1));
      expect(await screen.findByText('A column needs a name')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();

      await userEvent.type(nameOf(1), 'a'.repeat(41));
      expect(await screen.findByText('A column name is at most 40 characters')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });
  });

  describe('reordering', () => {
    it('moves a column up and down with named buttons, and keeps the button focused', async () => {
      const { onSave } = renderModal();
      await ready();

      await userEvent.click(screen.getByRole('button', { name: 'Move Doing up' }));

      expect(names()).toEqual(['Doing', 'Backlog', 'Done']);
      expect(announcement()).toHaveTextContent('Moved Doing up, now column 1 of 3.');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Move Doing down' })).toHaveFocus());

      await userEvent.click(screen.getByRole('button', { name: 'Move Backlog down' }));
      expect(names()).toEqual(['Doing', 'Done', 'Backlog']);

      await userEvent.click(saveButton());
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(lastPayload(onSave).columns?.map(item => item._id)).toEqual(['col-doing', 'col-done', 'col-backlog']);
    });

    it('has no move up on the first column and no move down on the last', async () => {
      renderModal();
      await ready();

      expect(screen.getByRole('button', { name: 'Move Backlog up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move Done down' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move Doing up' })).toBeEnabled();
    });

    it('moves the landed line with the column that becomes last', async () => {
      renderModal();
      await ready();

      await userEvent.click(screen.getByRole('button', { name: 'Move Done up' }));

      const landed = screen.getByText('Cards in this column count as landed.');
      expect(landed.closest('li')).toContainElement(nameOf(3));
      expect(nameOf(3)).toHaveValue('Doing');
    });
  });

  describe('removing', () => {
    it('removes an empty column and leaves it out of the request', async () => {
      const { onSave } = renderModal({ counts: { 'col-doing': 0 } });
      await ready();

      await userEvent.click(screen.getByRole('button', { name: 'Remove Doing' }));

      expect(names()).toEqual(['Backlog', 'Done']);
      expect(announcement()).toHaveTextContent('Removed Doing. 2 columns left.');
      await userEvent.click(saveButton());
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(lastPayload(onSave).columns?.map(item => item._id)).toEqual(['col-backlog', 'col-done']);
    });

    it('blocks a column that has cards and says how many and what to do', async () => {
      renderModal({ counts: { 'col-doing': 3 } });
      await ready();

      const remove = screen.getByRole('button', { name: 'Remove Doing' });

      expect(remove).toBeDisabled();
      expect(remove).toHaveAccessibleDescription('Doing has 3 cards. Move them to another column to remove this column.');
      expect(screen.getByRole('button', { name: 'Remove Backlog' })).toBeEnabled();
    });

    it('says "card" for one', async () => {
      renderModal({ counts: { 'col-doing': 1 } });
      await ready();

      expect(screen.getByRole('button', { name: 'Remove Doing' })).toHaveAccessibleDescription(
        'Doing has 1 card. Move it to another column to remove this column.'
      );
    });

    it('keeps at least 2 columns: with two left, removal is off on both', async () => {
      renderModal({ columns: COLUMNS.slice(0, 2) });
      await ready();

      for (const title of ['Backlog', 'Doing']) {
        const remove = screen.getByRole('button', { name: `Remove ${title}` });
        expect(remove).toBeDisabled();
        expect(remove).toHaveAccessibleDescription('A board keeps at least 2 columns.');
      }
    });

    it('lets a column that was just added be removed again, whatever its name', async () => {
      renderModal();
      await ready();
      await userEvent.type(within(addSection()).getByRole('textbox', { name: 'New column name' }), 'Review');
      await userEvent.click(within(addSection()).getByRole('button', { name: 'Add column' }));

      await userEvent.click(screen.getByRole('button', { name: 'Remove Review' }));

      expect(names()).toEqual(['Backlog', 'Doing', 'Done']);
    });
  });

  describe('saving and cancelling', () => {
    it('sends no columns when none changed', async () => {
      const { onSave } = renderModal();
      await ready();

      await userEvent.clear(screen.getByRole('textbox', { name: /board name/i }));
      await userEvent.type(screen.getByRole('textbox', { name: /board name/i }), 'Only the name');
      await userEvent.click(saveButton());

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(lastPayload(onSave)).not.toHaveProperty('columns');
    });

    it('discards every column change on Cancel, and shows the board again when it is opened next', async () => {
      const { onSave, onClose, rerender, element } = renderModal();
      await ready();
      await userEvent.clear(nameOf(1));
      await userEvent.type(nameOf(1), 'Changed');
      await userEvent.click(screen.getByRole('button', { name: 'Remove Doing' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();

      rerender(element(false));
      rerender(element(true));

      await waitFor(() => expect(names()).toEqual(['Backlog', 'Doing', 'Done']));
    });

    it('shows the server\'s answer when a column gained cards and keeps the edits', async () => {
      const message = 'The column "Doing" still has tasks. Move them to another column before removing it.';
      const onSave = vi.fn().mockRejectedValueOnce(rejectedWith(409, message)).mockResolvedValue(undefined);
      const { onClose } = renderModal({ onSave, counts: {} });
      await ready();
      await userEvent.click(screen.getByRole('button', { name: 'Remove Doing' }));

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(onClose).not.toHaveBeenCalled();
      expect(names()).toEqual(['Backlog', 'Done']);
    });

    it('says a generic failure for anything else, and keeps the edits', async () => {
      const onSave = vi.fn().mockRejectedValue(rejectedWith(500, 'Boom'));
      renderModal({ onSave });
      await ready();
      await userEvent.click(screen.getByRole('button', { name: 'Remove Backlog' }));

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
      expect(names()).toEqual(['Doing', 'Done']);
    });
  });

  it('lets a board with fewer than two columns save its name, and gain columns', async () => {
    const { onSave } = renderModal({ columns: [] });
    await screen.findByRole('textbox', { name: 'New column name' });

    await userEvent.clear(screen.getByRole('textbox', { name: /board name/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /board name/i }), 'Renamed');

    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(lastPayload(onSave)).not.toHaveProperty('columns');
  });

  it('puts the cursor in the name of the column to add when it is opened from "Add column"', async () => {
    renderModal({ focusColumns: true });
    await ready();

    await waitFor(() => expect(within(addSection()).getByRole('textbox', { name: 'New column name' })).toHaveFocus());
  });

  it('has no axe violations', async () => {
    renderModal({ counts: { 'col-doing': 2 } });
    await ready();

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
