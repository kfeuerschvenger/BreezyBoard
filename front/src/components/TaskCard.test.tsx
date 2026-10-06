import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import TaskCard from './TaskCard';
import { ColorService } from '@/services';
import type { Task } from '@/models';

// Characterization, written against the card as it stands before section
// 12.5 takes its colour fetching and its priority map away.
vi.mock('@/services', () => ({
  ColorService: { getById: vi.fn(), getByType: vi.fn() },
}));

const mockedColorService = vi.mocked(ColorService);

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

// useSortable needs both contexts above it. Without them the card renders,
// but the drag attributes it is asserted on below are never applied.
const renderCard = (task: Task, props: { color?: string; onClick?: () => void; isDragging?: boolean } = {}) =>
  render(
    <DndContext>
      <SortableContext items={[task._id]}>
        <TaskCard task={task} {...props} />
      </SortableContext>
    </DndContext>
  );

const card = () => screen.getByRole('article');

beforeEach(() => {
  mockedColorService.getById.mockReset().mockResolvedValue({ _id: 'color-red', name: 'Red', value: '#EF4444' });
});

describe('TaskCard rendering', () => {
  it('shows the task and names itself by its title', () => {
    renderCard(makeTask({}));

    expect(screen.getByRole('heading', { name: 'Write the release notes' })).toBeInTheDocument();
    expect(screen.getByText('For this cycle.')).toBeInTheDocument();
    expect(card()).toHaveAccessibleName('Write the release notes');
  });

  it('leaves the description out entirely when there is none', () => {
    renderCard(makeTask({ description: '' }));

    expect(screen.queryByText('For this cycle.')).not.toBeInTheDocument();
  });

  it('names the owner when the task carries a populated one', () => {
    renderCard(
      makeTask({
        owner: { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' },
      })
    );

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  // An owner held as a bare id cannot be named without a lookup the card does
  // not do, so it shows nothing rather than an id.
  it('shows no owner when the task carries only an id', () => {
    renderCard(makeTask({ owner: 'user-ada' }));

    expect(within(card()).queryByText(/user-ada/)).not.toBeInTheDocument();
  });
});

describe('TaskCard checklist progress', () => {
  it('counts what is done out of the total', () => {
    renderCard(
      makeTask({
        checklist: [
          { text: 'One', completed: true },
          { text: 'Two', completed: true },
          { text: 'Three', completed: false },
        ],
      })
    );

    expect(screen.getByText('2/3 completed')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('shows no progress at all for a task with no checklist', () => {
    renderCard(makeTask({ checklist: [] }));

    expect(screen.queryByText(/completed/)).not.toBeInTheDocument();
  });
});

describe('TaskCard priority', () => {
  it.each([
    ['low', 'bg-green-100'],
    ['medium', 'bg-yellow-100'],
    ['high', 'bg-red-100'],
  ] as const)('tints the %s badge with its own colour', (priority, expectedClass) => {
    renderCard(makeTask({ priority }));

    // Found by class because the badge is hidden from assistive technology,
    // which P4-3 records as a defect: the priority is real information and
    // this is the only place a task shows it.
    const badge = card().querySelector(`.${expectedClass}`);
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent(priority);
  });

  // P4-3 recorded the whole badge as aria-hidden, which hid real information
  // rather than a decorative icon: this is the only place a task shows its
  // priority, so hiding it left the card saying nothing about it at all.
  //
  // Asserted on the attribute and on the text, because a plain text query
  // reads the DOM and finds the content either way. Only role queries consult
  // the accessibility tree, and a badge has no role to query.
  it('announces the priority instead of hiding it (P4-3)', () => {
    renderCard(makeTask({ priority: 'high' }));

    const badge = card().querySelector('.bg-red-100');
    expect(badge).not.toHaveAttribute('aria-hidden');
    // "high" on its own is a word with no subject. The prefix is carried for
    // assistive technology only, so the badge still reads as one word.
    expect(badge).toHaveTextContent('Priority: high');
  });

  it('keeps the icon out of it, since the word beside it already says so', () => {
    renderCard(makeTask({ priority: 'high' }));

    expect(card().querySelector('.bg-red-100 svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('TaskCard colour', () => {
  const withChecklist = (color: string | undefined) =>
    makeTask({ color: color as never, checklist: [{ text: 'One', completed: true }] });

  it('paints the progress bar with the colour it was handed', () => {
    renderCard(withChecklist('#3B82F6'), { color: '#10B981' });

    expect(card().querySelector('[style*="background-color"]')).toHaveStyle({ backgroundColor: '#10B981' });
  });

  it('falls back to the neutral when it was handed none', () => {
    renderCard(withChecklist('#3B82F6'));

    expect(card().querySelector('[style*="background-color"]')).toHaveStyle({ backgroundColor: '#64748B' });
  });

  // The card used to resolve its own colour, which cost a request for any
  // task whose colour was stored as an id. A board of thirty tasks asked the
  // colour endpoint thirty times for parts of a list served whole at
  // /colors?type=task. Whoever renders the board reads it once now.
  it('asks the colour endpoint for nothing', async () => {
    renderCard(withChecklist('color-red'), { color: '#EF4444' });

    await waitFor(() =>
      expect(card().querySelector('[style*="background-color"]')).toHaveStyle({ backgroundColor: '#EF4444' })
    );
    expect(mockedColorService.getById).not.toHaveBeenCalled();
    expect(mockedColorService.getByType).not.toHaveBeenCalled();
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

describe('TaskCard priority it does not recognise', () => {
  // The API constrains this field, so a value outside the three is a bug
  // somewhere else. The card still has to draw something rather than render
  // an unstyled badge or fall over.
  // The word and the colour are normalised together rather than the raw
  // value being printed in a colour that means something else. A badge
  // reading "urgent" in the green that means low is a worse answer than one
  // reading "low": the colour is what anybody scanning a board actually
  // reads, so the two have to agree.
  it('falls back to the least urgent, in both the word and the colour', () => {
    renderCard(makeTask({ priority: 'urgent' as never }));

    const badge = card().querySelector('.bg-green-100');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('Priority: low');
  });
});
