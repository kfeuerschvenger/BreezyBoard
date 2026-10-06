import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { AddMemberModal } from './AddMemberModal';
import { UserService } from '@/services';
import type { User } from '@/models';

// Characterization, written against the modal as it stands before section
// 12.5 takes it apart. Every case pins behaviour a user can see today.
vi.mock('@/services', () => ({
  UserService: { search: vi.fn() },
}));

const mockedUserService = vi.mocked(UserService);

const ADA: User = {
  _id: 'user-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  avatar: '',
  role: 'Engineer',
  department: 'Analytical Engine',
};

const GRACE: User = {
  _id: 'user-grace',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@example.com',
  avatar: '',
  role: 'Rear Admiral',
  department: 'Compilers',
};

const renderModal = (props: Partial<React.ComponentProps<typeof AddMemberModal>> = {}) => {
  const onClose = vi.fn();
  const onAddMembers = vi.fn();

  renderWithQuery(
    <AddMemberModal
      open
      onClose={onClose}
      onAddMembers={onAddMembers}
      boardTitle="Launch Plan"
      boardId="board-1"
      {...props}
    />
  );

  return { onClose, onAddMembers };
};

/**
 * The row for one person in the results list.
 *
 * Matched by a function rather than a pattern because two things carry the
 * name. The chip's "Remove Ada Lovelace" button has to be excluded, and the
 * row itself cannot be anchored at the start: its accessible name begins with
 * the initials drawn where the avatar would be, so it reads "AL Ada Lovelace
 * Engineer ...". Those initials repeat the name that follows them and would
 * be better hidden, which is noted rather than fixed here.
 */
const memberRow = (name: string) =>
  screen.getByRole('button', {
    name: accessibleName => accessibleName.includes(name) && !accessibleName.startsWith('Remove'),
  });

beforeEach(() => {
  mockedUserService.search.mockReset().mockResolvedValue([ADA, GRACE]);
});

describe('AddMemberModal searching', () => {
  it('names the board it is adding people to', async () => {
    renderModal();

    expect(await screen.findByRole('dialog', { name: /Add Members/ })).toBeInTheDocument();
    expect(screen.getByText('Add team members to "Launch Plan"')).toBeInTheDocument();
  });

  it('puts the cursor in the search field so typing just works', async () => {
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('Search team members')).toHaveFocus());
  });

  it('lists what the search returns', async () => {
    renderModal();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('searches within the board it was given, so people already on it are left out', async () => {
    renderModal();

    await waitFor(() => expect(mockedUserService.search).toHaveBeenCalledWith('', 'board-1'));
  });

  // The search runs as the person types. Without a debounce that is one
  // request per keystroke against an endpoint that scans users.
  it('asks once for a word typed in one go, not once per letter', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ada Lovelace');
    mockedUserService.search.mockClear();

    await user.type(screen.getByLabelText('Search team members'), 'grace');

    await waitFor(() => expect(mockedUserService.search).toHaveBeenCalledWith('grace', 'board-1'));
    expect(mockedUserService.search).toHaveBeenCalledTimes(1);
  });
});

describe('AddMemberModal when answers come back out of order', () => {
  // The component carries an explicit request id for this and nothing
  // covered it. A slow first search resolving after a faster second one
  // would otherwise replace the list with results for a query the person has
  // already moved on from, and the field would disagree with the list under
  // it. The same shape as the drag concurrency guard, one layer up.
  it('keeps the results of the latest search when an earlier one lands after it', async () => {
    const user = userEvent.setup();

    let resolveFirst: (users: User[]) => void = () => {};
    mockedUserService.search
      .mockImplementationOnce(
        () =>
          new Promise<User[]>(resolve => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue([GRACE]);

    renderModal();

    // Wait for the opening search to actually go out before typing. Typing
    // sooner just restarts the debounce, so only one request is ever made and
    // there is no ordering to test.
    await waitFor(() => expect(mockedUserService.search).toHaveBeenCalledTimes(1));

    // Now a second search goes out and answers while the first is still open.
    await user.type(screen.getByLabelText('Search team members'), 'a');
    await screen.findByText('Grace Hopper', {}, { timeout: 3000 });

    await act(async () => {
      resolveFirst([ADA]);
    });

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });
});

describe('AddMemberModal states with nothing to list', () => {
  it('says it is working while the search is out', async () => {
    mockedUserService.search.mockReturnValue(new Promise(() => {}));

    renderModal();

    expect(await screen.findByText('Loading team members...')).toBeInTheDocument();
  });

  it('says so and offers a way back when the search fails', async () => {
    mockedUserService.search.mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderModal();

    expect(await screen.findByText('Failed to load team members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // Try again used to clear the search term and nothing else. On the search
  // that runs as the modal opens, the term is already empty, so clearing it
  // changed no state, ran no query, and the button did nothing at all in the
  // one case it exists for.
  it('actually searches again when Try again is pressed', async () => {
    const user = userEvent.setup();
    mockedUserService.search.mockRejectedValueOnce(new Error('network down')).mockResolvedValue([ADA]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderModal();
    await screen.findByText('Failed to load team members');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load team members')).not.toBeInTheDocument();
  });

  it('says nobody matched rather than showing an empty panel', async () => {
    mockedUserService.search.mockResolvedValue([]);

    renderModal();

    expect(await screen.findByText('No members found matching your search')).toBeInTheDocument();
  });
});

describe('AddMemberModal selecting', () => {
  it('offers nothing to add until somebody is chosen', async () => {
    renderModal();
    await screen.findByText('Ada Lovelace');

    expect(screen.getByRole('button', { name: /^Add Member/ })).toBeDisabled();
  });

  it('marks a chosen person as pressed and counts them', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ada Lovelace');

    await user.click(memberRow('Ada Lovelace'));

    expect(memberRow('Ada Lovelace')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Add 1 Member$/ })).toBeEnabled();
  });

  it('lets a chosen person be taken off again from their chip', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ada Lovelace');

    await user.click(memberRow('Ada Lovelace'));
    await user.click(screen.getByRole('button', { name: 'Remove Ada Lovelace' }));

    expect(memberRow('Ada Lovelace')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Add Member/ })).toBeDisabled();
  });

  it('is operable by keyboard alone, which the near-identical list in the drawer was not', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ada Lovelace');

    memberRow('Ada Lovelace').focus();
    await user.keyboard(' ');

    expect(memberRow('Ada Lovelace')).toHaveAttribute('aria-pressed', 'true');
  });

  it('hands over everybody chosen and closes', async () => {
    const user = userEvent.setup();
    const { onAddMembers, onClose } = renderModal();
    await screen.findByText('Ada Lovelace');

    await user.click(memberRow('Ada Lovelace'));
    await user.click(memberRow('Grace Hopper'));
    await user.click(screen.getByRole('button', { name: /Add 2 Members$/ }));

    expect(onAddMembers).toHaveBeenCalledWith([ADA, GRACE]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddMemberModal leaving without adding anybody', () => {
  it('adds nobody when cancelled', async () => {
    const user = userEvent.setup();
    const { onAddMembers, onClose } = renderModal();
    await screen.findByText('Ada Lovelace');

    await user.click(memberRow('Ada Lovelace'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onAddMembers).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('adds nobody when dismissed with Escape', async () => {
    const user = userEvent.setup();
    const { onAddMembers, onClose } = renderModal();
    await screen.findByText('Ada Lovelace');

    await user.click(memberRow('Ada Lovelace'));
    await user.keyboard('{Escape}');

    expect(onAddMembers).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // Reopening has to start clean, in both senses. A selection left behind
  // would be added to the next board the modal is opened for, and a search
  // term left behind would open it showing results for a query about the
  // previous one.
  it('forgets the previous selection and the previous search when it is reopened', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAddMembers = vi.fn();

    const { rerender } = renderWithQuery(
      <AddMemberModal open onClose={onClose} onAddMembers={onAddMembers} boardTitle="Launch Plan" boardId="board-1" />
    );
    await screen.findByText('Ada Lovelace');
    await user.click(memberRow('Ada Lovelace'));
    await user.type(screen.getByLabelText('Search team members'), 'grace');

    rerender(
      <AddMemberModal
        open={false}
        onClose={onClose}
        onAddMembers={onAddMembers}
        boardTitle="Launch Plan"
        boardId="board-1"
      />
    );
    rerender(
      <AddMemberModal open onClose={onClose} onAddMembers={onAddMembers} boardTitle="Launch Plan" boardId="board-1" />
    );

    await screen.findByText('Ada Lovelace');
    expect(memberRow('Ada Lovelace')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Add Member/ })).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByText('0 members selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Search team members')).toHaveValue('');
  });
});
