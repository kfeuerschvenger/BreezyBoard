import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import TaskCard from './TaskCard';
import { ColorService } from '@/services';
import { clearColorCache } from '@/utils/colorUtils';
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
const renderCard = (task: Task, props: { onClick?: () => void; isDragging?: boolean } = {}) =>
  render(
    <DndContext>
      <SortableContext items={[task._id]}>
        <TaskCard task={task} {...props} />
      </SortableContext>
    </DndContext>
  );

const card = () => screen.getByRole('article');

beforeEach(() => {
  clearColorCache();
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

  // Asserted on the attribute rather than by querying for the text. A text
  // query reads the DOM and finds it either way; only the role queries
  // consult the accessibility tree, and a span has no role to query.
  it('pins current behaviour (finding P4-3): the priority is hidden from assistive technology', () => {
    renderCard(makeTask({ priority: 'high' }));

    expect(card().querySelector('.bg-red-100')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('TaskCard colour', () => {
  it('paints the progress bar with a colour already given as a hex value', () => {
    renderCard(makeTask({ color: '#3B82F6', checklist: [{ text: 'One', completed: true }] }));

    expect(card().querySelector('[style*="background-color"]')).toHaveStyle({ backgroundColor: '#3B82F6' });
  });

  // One request per card. A board of thirty tasks asks the colour endpoint
  // thirty times for parts of a list it serves whole at /colors?type=task.
  it('pins current behaviour: a colour held as an id costs this card its own request', async () => {
    renderCard(makeTask({ color: 'color-red', checklist: [{ text: 'One', completed: true }] }));

    await waitFor(() => expect(mockedColorService.getById).toHaveBeenCalledWith('color-red'));
    await waitFor(() =>
      expect(card().querySelector('[style*="background-color"]')).toHaveStyle({ backgroundColor: '#EF4444' })
    );
  });
});

describe('TaskCard drag handle', () => {
  it('offers a named handle that the drag sensors are bound to', () => {
    renderCard(makeTask({}));

    const handle = screen.getByLabelText('Drag handle');
    // dnd-kit sets these itself, and the spread order in the card is what
    // keeps them: a duplicate prop after the spread silently replaces the
    // sensor activators, which is what finding P0-3 was.
    expect(handle).toHaveAttribute('role', 'button');
    expect(handle).toHaveAttribute('tabindex', '0');
  });
});
