import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import TaskCard, { TaskCardOverlay } from './TaskCard';
import { BreezeContext } from '@/features/breeze/breezeContext';
import type { BreezeContextValue } from '@/features/breeze/breezeContext';
import { swayAnimation, swayOf } from '@/features/breeze';
import { hueFromSeed, MID_BACKGROUND } from '@/shared/ui';
import type { Task } from '@/models';

const makeTask = (overrides: Partial<Task>): Task => ({
  _id: 'task-1',
  title: 'Write the release notes',
  description: 'For this cycle.',
  status: 'col-todo',
  priority: 'medium',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
  ...overrides,
});

type CardProps = Omit<React.ComponentProps<typeof TaskCard>, 'task'>;

// useSortable needs both contexts above it. Without them the card renders,
// but the drag attributes it is asserted on below are never applied.
const renderCard = (task: Task, props: CardProps = {}) =>
  render(
    <DndContext>
      <SortableContext items={[task._id]}>
        <TaskCard task={task} {...props} />
      </SortableContext>
    </DndContext>,
  );

const card = () => screen.getByRole('article');

// After a pick up, dnd-kit's pointer sensor keeps a capturing click listener on
// the document for 50 milliseconds to swallow the click that ends the drag. A
// test that sends a click straight after one that picked a card up would have
// it swallowed and pass for the wrong reason.
const clickListenerGone = () => new Promise(resolve => setTimeout(resolve, 80));

const ADA = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' };

describe('TaskCard rendering', () => {
  it('shows the task and names itself by its title', () => {
    renderCard(makeTask({}));

    expect(screen.getByRole('heading', { name: 'Write the release notes' })).toBeInTheDocument();
    expect(card()).toHaveAccessibleName('Write the release notes');
  });

  // The design's card is a title, a few facts and a person. The description is
  // read by opening the task.
  it('does not print the description', () => {
    renderCard(makeTask({ description: 'For this cycle.' }));

    expect(screen.queryByText('For this cycle.')).not.toBeInTheDocument();
  });

  describe('the description marker', () => {
    const marker = () => card().querySelector('[data-task-description]');

    it('shows a decorative icon with a hint for assistive technology when there is a description', () => {
      renderCard(makeTask({ description: 'For this cycle.' }));

      expect(marker()).toBeInTheDocument();
      expect(marker()?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(marker()?.querySelector('.sr-only')).toHaveTextContent('Has a description');
    });

    it('keeps the card named by its title alone', () => {
      renderCard(makeTask({ description: 'For this cycle.' }));

      expect(card()).toHaveAccessibleName('Write the release notes');
    });

    it.each([undefined, '', '   '])('draws nothing for a description of %j', description => {
      renderCard(makeTask({ description }));

      expect(marker()).not.toBeInTheDocument();
    });

    it('draws it in the secondary ink, which holds contrast on the card', () => {
      renderCard(makeTask({ description: 'For this cycle.' }));

      expect(marker()).toHaveClass('text-ink-secondary');
    });
  });

  it('names the owner for assistive technology and draws their avatar', () => {
    renderCard(makeTask({ owner: ADA }));

    expect(within(card()).getByText('Owner: Ada Lovelace')).toBeInTheDocument();
    expect(within(card()).getByText('AL')).toBeInTheDocument();
  });

  // The fill follows the id, so a renamed person keeps the colour they have
  // been seen in on every screen.
  it('seeds the avatar with the owner id, not the name', () => {
    renderCard(makeTask({ owner: ADA }));

    const avatar = within(card()).getByText('AL').parentElement as HTMLElement;
    expect(avatar).toHaveClass(MID_BACKGROUND[hueFromSeed(ADA._id)]);
  });

  // An owner held as a bare id cannot be named without a lookup the card does
  // not do, so it shows nothing rather than an id.
  it('shows no owner when the task carries only an id', () => {
    renderCard(makeTask({ owner: 'user-ada' }));

    expect(within(card()).queryByText(/user-ada/)).not.toBeInTheDocument();
    expect(within(card()).queryByText(/Owner:/)).not.toBeInTheDocument();
  });
});

describe('TaskCard checklist', () => {
  const checklist = (done: number, total: number) =>
    Array.from({ length: total }, (_, index) => ({ text: `Item ${index}`, completed: index < done }));

  it('counts what is done out of the total, and says what the figures are', () => {
    renderCard(makeTask({ checklist: checklist(2, 3) }));

    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(card()).toHaveTextContent('2/3 checklist items completed');
  });

  it('shows nothing at all for a task with no checklist', () => {
    renderCard(makeTask({ checklist: [] }));

    expect(card().querySelector('[data-checklist-progress]')).toBeNull();
  });

  // The green is a second cue, the figures are the first: 3/3 reads as done
  // to a person who cannot tell the greens apart.
  it('draws a finished checklist in green and an unfinished one in the secondary text', () => {
    const { unmount } = renderCard(makeTask({ checklist: checklist(3, 3) }));
    expect(card().querySelector('[data-checklist-progress]')).toHaveClass('text-green-deep');
    unmount();

    renderCard(makeTask({ checklist: checklist(2, 3) }));
    expect(card().querySelector('[data-checklist-progress]')).toHaveClass('text-ink-secondary');
    expect(card().querySelector('[data-checklist-progress]')).not.toHaveClass('text-green-deep');
  });
});

describe('TaskCard priority', () => {
  it.each([
    ['low', 'green'],
    ['medium', 'sand'],
    ['high', 'coral'],
  ] as const)('draws the %s chip in the %s hue', (priority, hue) => {
    renderCard(makeTask({ priority }));

    const chip = within(card()).getByText(new RegExp(priority, 'i')).closest('span.rounded-pill') as HTMLElement;
    expect(chip).toHaveClass(`bg-${hue}-tint`);
    expect(chip).toHaveClass(`text-${hue}-deep`);
  });

  // P4-3 recorded the whole badge as aria-hidden, which hid real information
  // rather than a decorative icon: this is the only place a task shows its
  // priority, so hiding it left the card saying nothing about it at all.
  //
  // Asserted on the attribute and on the text, because a plain text query
  // reads the DOM and finds the content either way.
  it('announces the priority instead of hiding it (P4-3)', () => {
    renderCard(makeTask({ priority: 'high' }));

    const chip = within(card()).getByText('High').closest('span.rounded-pill') as HTMLElement;
    expect(chip).not.toHaveAttribute('aria-hidden');
    // "High" on its own is a word with no subject. The prefix is carried for
    // assistive technology only, so the chip still reads as one word.
    expect(chip).toHaveTextContent('Priority: High');
  });

  // The API constrains this field, so a value outside the three is a bug
  // somewhere else. The word and the hue are normalised together, because the
  // hue is what anybody scanning a board reads and the two have to agree.
  it('falls back to the least urgent, in both the word and the hue', () => {
    renderCard(makeTask({ priority: 'urgent' as never }));

    const chip = within(card()).getByText('Low').closest('span.rounded-pill') as HTMLElement;
    expect(chip).toHaveClass('bg-green-tint');
    expect(chip).toHaveTextContent('Priority: Low');
  });
});

describe('TaskCard colour', () => {
  it('draws the colour it was handed as a dot, hidden from assistive technology', () => {
    renderCard(makeTask({}), { color: '#10B981' });

    const dot = card().querySelector('[data-task-colour]');
    expect(dot).toHaveStyle({ backgroundColor: '#10B981' });
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to the neutral when it was handed none', () => {
    renderCard(makeTask({}));

    expect(card().querySelector('[data-task-colour]')).toHaveStyle({ backgroundColor: '#64748B' });
  });
});

describe('TaskCard in the last column', () => {
  it('draws a check and mutes the title', () => {
    renderCard(makeTask({}), { done: true });

    const title = screen.getByRole('button', { name: 'Write the release notes' });
    expect(title).toHaveClass('text-ink-secondary');
    expect(card().querySelector('svg.text-success')).not.toBeNull();
  });

  it('draws neither on a card that has not landed', () => {
    renderCard(makeTask({}));

    expect(screen.getByRole('button', { name: 'Write the release notes' })).toHaveClass('text-ink');
    expect(card().querySelector('svg.text-success')).toBeNull();
  });
});

describe('TaskCard opening', () => {
  // The card is not itself a control. The keyboard opens the task through its
  // title, which is a real button, and the mouse through the card around it.
  it('opens from the title button with the keyboard', async () => {
    const onClick = vi.fn();
    renderCard(makeTask({}), { onClick });

    screen.getByRole('button', { name: 'Write the release notes' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens once when the mouse presses the title, not once for the button and once for the card', async () => {
    const onClick = vi.fn();
    renderCard(makeTask({}), { onClick });

    await userEvent.click(screen.getByRole('button', { name: 'Write the release notes' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens from the card around the title', async () => {
    const onClick = vi.fn();
    renderCard(makeTask({ checklist: [{ text: 'One', completed: true }] }), { onClick });

    await userEvent.click(screen.getByText('1/1'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not open when the drag handle is pressed', async () => {
    const onClick = vi.fn();
    renderCard(makeTask({}), { onClick });

    await userEvent.click(screen.getByLabelText('Drag handle'));

    expect(onClick).not.toHaveBeenCalled();
  });

  // dnd-kit swallows the click that follows a pick up, which is why the test
  // above cannot tell whether the card guards against it itself. A click that
  // reaches the handle some other way, a keyboard activation fires one, is sent
  // here directly, and the card must still not treat it as opening the task.
  it('does not open for a click that reaches the handle without a pointer', async () => {
    const onClick = vi.fn();
    renderCard(makeTask({}), { onClick });
    await clickListenerGone();

    fireEvent.click(screen.getByLabelText('Drag handle'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not open for a click that reaches the Move to button without a pointer', async () => {
    const onClick = vi.fn();
    renderCard(makeTask({}), {
      onClick,
      onMove: vi.fn(),
      moveTargets: [{ id: 'col-todo', title: 'To Do' }],
    });
    await clickListenerGone();

    fireEvent.click(screen.getByRole('button', { name: /move write the release notes/i }));

    expect(onClick).not.toHaveBeenCalled();
  });

  // The menu's popup is rendered in a portal, and React lets a click inside it
  // bubble to the card that owns the menu. The popup stops it at its own edge.
  it('does not open when a column is chosen in its Move to menu', async () => {
    const onClick = vi.fn();
    const onMove = vi.fn();
    const moveTargets = [
      { id: 'col-todo', title: 'To Do' },
      { id: 'col-done', title: 'Done' },
    ];
    renderCard(makeTask({}), { onClick, moveTargets, onMove });

    await userEvent.click(screen.getByRole('button', { name: /move write the release notes/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));

    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-1' }), moveTargets[1]);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TaskCard drag handle', () => {
  it('offers a named handle that the drag sensors are bound to', () => {
    renderCard(makeTask({}));

    const handle = screen.getByLabelText('Drag handle');
    // dnd-kit sets the role and tabindex itself, and the spread order in the
    // card is what keeps them: a duplicate prop after the spread silently
    // replaces the sensor activators, which is what finding P0-3 was.
    expect(handle).toHaveAttribute('role', 'button');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  // A real button rather than a div dressed as one. The div needed dnd-kit to
  // supply the role, the tab stop and the key handling, none of which static
  // analysis can see through a spread, so it sat under two permanent
  // accessibility warnings that could not be answered without rewriting it.
  it('is a real button, so the keyboard reaches it without dnd-kit saying so', () => {
    renderCard(makeTask({}));

    expect(screen.getByLabelText('Drag handle').tagName).toBe('BUTTON');
  });
});

describe('TaskCard held in the air', () => {
  // Collapsed and not removed: the keyboard sensor listens on the card and
  // focus has to still be on its handle when the card is put down.
  it('stays in the document with its handle, and takes no room', () => {
    renderCard(makeTask({}), { held: true });

    expect(screen.getByLabelText('Drag handle')).toBeInTheDocument();
    expect(card()).toHaveClass('h-0');
    expect(card()).toHaveClass('overflow-hidden');
  });

  // A box cannot be shorter than its padding, so a padded card collapsed with
  // h-0 would still be 24 pixels tall. jsdom has no layout, so the class is
  // what can be pinned here; the height is measured in a browser.
  it('carries no padding while it is collapsed', () => {
    renderCard(makeTask({}), { held: true });

    expect(card().className).not.toMatch(/\bp[xy]?-\d/);
  });
});

describe('TaskCard arriving', () => {
  it.each([
    ['landed', 'animate-bb-land'],
    ['fresh', 'animate-bb-in'],
  ] as const)('plays the %s animation', (entrance, animation) => {
    renderCard(makeTask({}), { entrance });

    expect(card()).toHaveClass(animation);
  });

  it('tells its owner when its own animation has ended, and not when one inside it has', () => {
    const onEntranceEnd = vi.fn();
    renderCard(makeTask({}), { entrance: 'landed', onEntranceEnd });

    // jsdom has no AnimationEvent, so the testing library's helper would send
    // a bare event; the plain event is what React is listening for.
    act(() => {
      card().querySelector('h3')!.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(onEntranceEnd).not.toHaveBeenCalled();

    act(() => {
      card().dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(onEntranceEnd).toHaveBeenCalledWith('task-1');
  });

  it('plays nothing it was not asked to', () => {
    renderCard(makeTask({}));

    expect(card().className).not.toMatch(/animate-bb-(land|in)/);
  });
});

describe('TaskCard in gusty weather', () => {
  const gusty = { level: 'gusty', stored: 'gusty', reducedBySystem: false } as unknown as BreezeContextValue;

  const renderIn = (value: BreezeContextValue, props: CardProps = {}) =>
    render(
      <BreezeContext.Provider value={value}>
        <DndContext>
          <SortableContext items={['task-1']}>
            <TaskCard task={makeTask({})} {...props} />
          </SortableContext>
        </DndContext>
      </BreezeContext.Provider>,
    );

  // The phase is the card's own: two cards that stand first in their columns
  // would be in step if it were its position, and a card that is moved would
  // change its rhythm.
  it('sways to a rhythm of its own, whatever its place in a column', () => {
    const { unmount } = renderIn(gusty);
    const first = card().style.animation;
    unmount();

    render(
      <BreezeContext.Provider value={gusty}>
        <DndContext>
          <SortableContext items={['task-2']}>
            <TaskCard task={makeTask({ _id: 'task-2' })} />
          </SortableContext>
        </DndContext>
      </BreezeContext.Provider>,
    );
    const second = card().style.animation;

    expect(first).toContain('bbSway');
    expect(second).toContain('bbSway');
    expect(first).not.toBe(second);
    expect(first).toBe(swayAnimation(swayOf('task-1')));
  });

  it('does not sway at any other level', () => {
    renderIn({ level: 'breezy', stored: 'breezy', reducedBySystem: false } as unknown as BreezeContextValue);

    expect(card().style.animation).toBe('');
  });

  // The system asking for less motion holds the level at still, so a card
  // that would sway at the stored Gusty does not.
  it('does not sway when the system asks for reduced motion', () => {
    renderIn({ level: 'still', stored: 'gusty', reducedBySystem: true } as unknown as BreezeContextValue);

    expect(card().style.animation).toBe('');
  });

  // One animation property, four purposes, one winner.
  it('plays its arrival instead of swaying', () => {
    renderIn(gusty, { entrance: 'landed' });

    expect(card().style.animation).toBe('');
    expect(card()).toHaveClass('animate-bb-land');
  });
});

describe('TaskCardOverlay', () => {
  it('is hidden from assistive technology and carries no control', () => {
    render(<TaskCardOverlay task={makeTask({})} />);

    const overlay = screen.getByRole('article', { hidden: true });
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(within(overlay).queryByRole('button', { hidden: true })).toBeNull();
  });
});
