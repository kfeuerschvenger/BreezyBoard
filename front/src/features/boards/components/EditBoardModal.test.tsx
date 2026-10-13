import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithQuery } from '@/test/renderWithQuery';
import { ColorService } from '@/services';
import type { Color } from '@/models';
import { EditBoardModal } from './EditBoardModal';

vi.mock('@/services', () => ({
  ColorService: { getByType: vi.fn() },
}));

const mockedColorService = vi.mocked(ColorService);

const COLORS: Color[] = [
  { _id: 'color-blue', name: 'Sky', value: 'sky' },
  { _id: 'color-green', name: 'Green', value: 'green' },
];

const BOARD = {
  title: 'Launch Plan',
  description: 'Everything for the launch',
  color: COLORS[0],
};

beforeEach(() => {
  mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
});

const renderModal = (onSave = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) => {
  const view = renderWithQuery(<EditBoardModal open board={BOARD} onClose={onClose} onSave={onSave} />);
  return { ...view, onSave, onClose };
};

const nameBox = () => screen.getByRole('textbox', { name: /board name/i });
const save = () => screen.getByRole('button', { name: /save changes/i });

describe('EditBoardModal', () => {
  it('starts from the board: its name, its description and its current colour', async () => {
    renderModal();

    expect(nameBox()).toHaveValue('Launch Plan');
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Everything for the launch');
    expect(await screen.findByRole('radio', { name: 'Sky' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Green' })).not.toBeChecked();
  });

  it('offers the six hues and no other colour', async () => {
    mockedColorService.getByType.mockResolvedValue([
      ...COLORS,
      { _id: 'color-old', name: 'Royal Blue', value: '#0052CC' },
      { _id: 'color-teal', name: 'Teal', value: 'teal' },
    ]);
    renderModal();

    await screen.findByRole('radio', { name: 'Teal' });

    expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('value'))).toEqual([
      'color-blue',
      'color-teal',
      'color-green',
    ]);
    expect(screen.queryByRole('radio', { name: 'Royal Blue' })).not.toBeInTheDocument();
  });

  it('says so when the palette holds no hue', async () => {
    mockedColorService.getByType.mockResolvedValue([{ _id: 'color-old', name: 'Royal Blue', value: '#0052CC' }]);
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent('The colours could not be loaded.');
  });

  it('does not offer the template, which only seeds columns at creation', async () => {
    renderModal();
    await screen.findByRole('radio', { name: 'Green' });

    expect(screen.queryByText(/template/i)).not.toBeInTheDocument();
  });

  it('saves the trimmed values with the chosen colour and closes', async () => {
    const { onSave, onClose } = renderModal();
    await screen.findByRole('radio', { name: 'Green' });

    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), '  Renamed  ');
    await userEvent.click(screen.getByRole('radio', { name: 'Green' }));
    await userEvent.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      title: 'Renamed',
      description: 'Everything for the launch',
      color: 'color-green',
    });
  });

  it('refuses an empty name and says why', async () => {
    renderModal();

    await userEvent.clear(nameBox());

    expect(await screen.findByText('A board needs a name')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('keeps the dialog open with the typed text when the save fails, and saves on a second try', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const { onClose } = renderModal(onSave);
    await screen.findByRole('radio', { name: 'Green' });

    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), 'Renamed');
    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(nameBox()).toHaveValue('Renamed');

    await userEvent.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('shows the board again, not the abandoned text, when it is opened a second time', async () => {
    const view = renderModal();
    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), 'Abandoned');

    view.rerender(<EditBoardModal open={false} board={BOARD} onClose={view.onClose} onSave={view.onSave} />);
    view.rerender(<EditBoardModal open board={BOARD} onClose={view.onClose} onSave={view.onSave} />);

    await waitFor(() => expect(nameBox()).toHaveValue('Launch Plan'));
  });

  it('has no axe violations', async () => {
    renderModal();
    await screen.findByRole('radio', { name: 'Green' });

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
