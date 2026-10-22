import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '@/test/renderWithQuery';
import { flushDraft } from '@/test/flushDraft';
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
  { _id: 'color-blue', name: 'Sky', value: 'sky' },
  { _id: 'color-green', name: 'Green', value: 'green' },
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

// Unmounting comes first: useDraft writes what it is still holding back when
// the component goes away, and that write has to land before the storage is
// emptied rather than after it, where the next test would find it.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const open = (onCreateBoard = vi.fn(), onClose = vi.fn()) => {
  const view = renderWithQuery(<CreateBoardModal open onClose={onClose} onCreateBoard={onCreateBoard} />);
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
  // The endpoint serves three palettes and the mock answers the same list
  // whichever one is asked for, so without this nothing says the board
  // palette is the one being read.
  it('asks for the board palette, not another one', async () => {
    open();

    await waitFor(() => expect(mockedColorService.getByType).toHaveBeenCalledWith('board'));
  });

  // The palette is the six design hues. The picker shows them in the hues' own
  // order whatever order the server lists them in, and an entry that names no
  // hue, such as an old hex colour left in the palette, is not offered because
  // a board cannot be saved with it.
  it('offers the six hues in their own order and leaves out an entry that is not one', async () => {
    mockedColorService.getByType.mockResolvedValue([
      { _id: 'color-lavender', name: 'Lavender', value: 'lavender' },
      { _id: 'color-old', name: 'Royal Blue', value: '#0052CC' },
      { _id: 'color-coral', name: 'Coral', value: 'coral' },
      { _id: 'color-sky', name: 'Sky', value: 'sky' },
    ]);
    open();

    await screen.findByRole('radio', { name: 'Sky' });

    const names = screen.getAllByRole('radio', { name: /^(Sky|Coral|Lavender|Royal Blue)$/ }).map(radio => radio.getAttribute('value'));
    expect(names).toEqual(['color-sky', 'color-coral', 'color-lavender']);
  });

  it('starts a new board on the first hue, not on whichever entry the server listed first', async () => {
    mockedColorService.getByType.mockResolvedValue([
      { _id: 'color-lavender', name: 'Lavender', value: 'lavender' },
      { _id: 'color-sky', name: 'Sky', value: 'sky' },
    ]);
    const user = userEvent.setup();
    const { onCreateBoard } = open();

    await waitFor(() => expect(screen.getByText('Kanban Board')).toBeInTheDocument());
    await user.type(titleBox(), 'Launch plan');
    await user.click(submit());

    expect(onCreateBoard.mock.calls[0][0]).toMatchObject({ color: 'color-sky' });
  });

  it('says so when the palette holds no hue, instead of leaving the form dead', async () => {
    mockedColorService.getByType.mockResolvedValue([{ _id: 'color-old', name: 'Royal Blue', value: '#0052CC' }]);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(submit()).toBeDisabled();
  });

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
    // The gate only opens once the colour and template lists have landed,
    // since the schema requires both. Clicking before then is a silent no-op
    // that reads afterwards as "the parent was never called".
    await waitFor(() => expect(submit()).toBeEnabled());
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
    await user.click(screen.getByText('Green'));
    await user.click(screen.getByText('Sprint Board'));
    await user.click(submit());

    expect(onCreateBoard.mock.calls[0][0]).toMatchObject({
      color: 'color-green',
      template: 'template-sprint',
    });
  });

  it('does not discard a name typed before the colours and templates arrive', async () => {
    // The defaults land on an async transition, so a fast typist is already
    // mid-word when they do. The implementation this replaced merged them
    // into the existing state; a wholesale reset throws the typing away, and
    // that is the defect where the colour fetch resolving late rebuilds the
    // whole form and wipes what was in it.
    //
    // Caught by the end to end suite rather than here, because every other
    // test in this file politely waits for the data first. This one does not.
    let resolveColors: (colors: Color[]) => void = () => {};
    mockedColorService.getByType.mockReturnValue(
      new Promise<Color[]>(resolve => {
        resolveColors = resolve;
      })
    );

    const user = userEvent.setup();
    const { onCreateBoard } = open();

    await user.type(titleBox(), 'Typed while loading');

    resolveColors(COLORS);

    await waitFor(() => expect(screen.getByText('Sky')).toBeInTheDocument());

    expect(titleBox()).toHaveValue('Typed while loading');
    // The submit gate has to re-open by itself once the data lands. The
    // validation that ran while the user was typing saw an empty colour and
    // template and closed it, and nothing will type again to reopen it.
    await waitFor(() => expect(submit()).toBeEnabled());

    await user.click(submit());

    expect(onCreateBoard.mock.calls[0][0]).toMatchObject({ title: 'Typed while loading' });
  });

  describe('draft persistence', () => {
    // The draft is written on a throttle, so a test that reads storage right
    // after typing needs the clock under its own control.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps what was typed so losing the page does not lose the work', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      open();

      await waitFor(() => expect(titleBox()).toBeInTheDocument());
      await user.type(titleBox(), 'Half written');
      await flushDraft();

      expect(storedDraft()).toMatchObject({ title: 'Half written' });
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

    // The restore and a keystroke race on the same transition, and the test
    // above cannot see the loser: it stores a draft and types nothing, so
    // writing the restored value over an empty field looks identical to
    // leaving the field alone. This one types first.
    it('leaves a name typed before the restore alone, rather than replacing it', async () => {
      storeDraft({ title: 'From yesterday', description: '', color: 'color-green', template: 'template-sprint' });

      let releaseColors: (colors: Color[]) => void = () => {};
      mockedColorService.getByType.mockReturnValue(
        new Promise<Color[]>(resolve => {
          releaseColors = resolve;
        })
      );

      const user = userEvent.setup();
      open();

      // The restore waits on the colours, so there is a window here where
      // the form is live and the stored draft has not been applied yet.
      await user.type(titleBox(), 'Typed just now');

      await act(async () => {
        releaseColors(COLORS);
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      await waitFor(() => expect(screen.getByText('Sky')).toBeInTheDocument());

      expect(titleBox()).toHaveValue('Typed just now');
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
      const { rerender } = renderWithQuery(<CreateBoardModal open onClose={vi.fn()} onCreateBoard={onCreateBoard} />);

      await waitFor(() => expect(titleBox()).toBeInTheDocument());
      await user.type(titleBox(), 'Launch plan');
      await waitFor(() => expect(submit()).toBeEnabled());
      await user.click(submit());

      // The parent closes the modal on success and leaves it open on
      // failure, so "submitted, then closed" is the only success signal this
      // component gets.
      rerender(<CreateBoardModal open={false} onClose={vi.fn()} onCreateBoard={onCreateBoard} />);

      await waitFor(() => expect(storedDraft()).toBeNull());
    });

    it('keeps the draft when the modal is closed without submitting', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { rerender } = renderWithQuery(<CreateBoardModal open onClose={vi.fn()} onCreateBoard={vi.fn()} />);

      await waitFor(() => expect(titleBox()).toBeInTheDocument());
      await user.type(titleBox(), 'Changed my mind');
      await flushDraft();
      expect(storedDraft()).toMatchObject({ title: 'Changed my mind' });

      rerender(<CreateBoardModal open={false} onClose={vi.fn()} onCreateBoard={vi.fn()} />);

      expect(storedDraft()).toMatchObject({ title: 'Changed my mind' });
    });
  });
});

describe('CreateBoardModal when the colours and templates cannot be loaded', () => {
  // The worst kind of failure, and the one this covers: the lists stay
  // empty, the schema requires a colour and a template, and so the create
  // button is disabled forever with nothing on screen explaining why. The
  // form looks perfectly ordinary and is permanently dead.
  //
  // It surfaced twice as an intermittent "the submit button never became
  // enabled" in two different test layers, and was twice put down to timing
  // before anybody looked at the catch block.
  it('says so instead of leaving a silently dead form', async () => {
    mockedColorService.getByType.mockRejectedValue(new Error('network down'));

    open();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be loaded/i);
    expect(submit()).toBeDisabled();
  });

  it('can be retried without closing and reopening the modal', async () => {
    const user = userEvent.setup();
    mockedColorService.getByType.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(COLORS);

    open();

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Sky')).toBeInTheDocument());

    await user.type(titleBox(), 'Recovered board');
    await waitFor(() => expect(submit()).toBeEnabled());
  });
});

describe('CreateBoardModal when a keystroke lands while the defaults are applied', () => {
  // A board name typed while the colours and templates are still in flight
  // has to survive the moment they arrive. Losing it leaves the form in its
  // worst possible shape: every other field selected and valid, no error on
  // screen, and a submit button that is disabled with nothing to explain why.
  //
  // The name is lost when the value sits in the input and the form does not
  // know about it, which is what a change event leaves behind when it lands
  // while the field registry is being rebuilt. Writing straight to the DOM
  // node without notifying React produces that state directly. Driving it
  // through the timing instead is not possible here, because act() flushes
  // the write and the re-render together and the window never opens.
  it('does not throw away a board name the form has not recorded', async () => {
    let resolveColors: (value: Color[]) => void = () => {};
    mockedColorService.getByType.mockReturnValue(
      new Promise<Color[]>(resolve => {
        resolveColors = resolve;
      })
    );

    renderWithQuery(<CreateBoardModal open onClose={vi.fn()} onCreateBoard={vi.fn()} />);

    const input = screen.getByPlaceholderText('Enter board name') as HTMLInputElement;
    input.value = 'Typed during the load';

    resolveColors(COLORS);

    await waitFor(() => expect(screen.getByText('Sky')).toBeInTheDocument());

    expect(input.value).toBe('Typed during the load');
  });
});
