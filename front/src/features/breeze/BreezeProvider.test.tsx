import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { restoreMatchMedia, stubMatchMedia } from '@/test/matchMedia';
import type { MediaStub } from '@/test/matchMedia';
import { UserService } from '@/services';
import { BreezeProvider } from './BreezeProvider';
import { useBreeze } from './useBreeze';

const auth = vi.hoisted(() => ({ user: null as null | { _id: string; breeze?: unknown } }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/services', () => ({ UserService: { update: vi.fn(), getById: vi.fn() } }));

const REDUCED = '(prefers-reduced-motion: reduce)';

const mockedUsers = vi.mocked(UserService);

/** Shows what the context says and offers a button for each choice. */
const Probe = () => {
  const { stored, level, reducedBySystem, setLevel } = useBreeze();
  return (
    <div>
      <p data-testid="stored">{stored}</p>
      <p data-testid="level">{level}</p>
      <p data-testid="reduced">{String(reducedBySystem)}</p>
      {(['still', 'calm', 'breezy', 'gusty'] as const).map(choice => (
        <button key={choice} type="button" onClick={() => setLevel(choice)}>
          {choice}
        </button>
      ))}
    </div>
  );
};

const renderProbe = () =>
  renderWithQuery(
    <BreezeProvider>
      <Probe />
    </BreezeProvider>,
  );

const stored = () => screen.getByTestId('stored').textContent;
const level = () => screen.getByTestId('level').textContent;

let media: MediaStub;

beforeEach(() => {
  media = stubMatchMedia({ [REDUCED]: false });
  auth.user = { _id: 'user-1', breeze: 'gusty' };
  mockedUsers.update.mockReset().mockResolvedValue({} as never);
  mockedUsers.getById.mockReset().mockResolvedValue({ breeze: 'gusty' } as never);
});

afterEach(restoreMatchMedia);

describe('the stored level', () => {
  it('comes with the signed in user and is not fetched', () => {
    renderProbe();

    expect(stored()).toBe('gusty');
    expect(level()).toBe('gusty');
    expect(mockedUsers.getById).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], ['hurricane'], [3]])('reads %s as the default, breezy', value => {
    auth.user = { _id: 'user-1', breeze: value };

    renderProbe();

    expect(stored()).toBe('breezy');
  });

  it('is the default, and cannot be saved, when nobody is signed in', async () => {
    const user = userEvent.setup();
    auth.user = null;
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    expect(stored()).toBe('breezy');
    expect(mockedUsers.update).not.toHaveBeenCalled();
  });
});

describe('choosing a level', () => {
  it('shows it at once, before the request has answered, and sends it to that person', async () => {
    const user = userEvent.setup();
    mockedUsers.update.mockReturnValue(new Promise(() => {}));
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    expect(stored()).toBe('calm');
    expect(level()).toBe('calm');
    expect(mockedUsers.update).toHaveBeenCalledWith('user-1', { breeze: 'calm' });
  });

  it('stays chosen once it has saved, without asking the server what it now is', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'still' }));
    await waitFor(() => expect(mockedUsers.update).toHaveBeenCalledTimes(1));

    expect(stored()).toBe('still');
    expect(mockedUsers.getById).not.toHaveBeenCalled();
  });

  it('goes back to what it was and says so when it could not be saved', async () => {
    const user = userEvent.setup();
    mockedUsers.update.mockRejectedValue(new Error('offline'));
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    await waitFor(() => expect(stored()).toBe('gusty'));
    expect(await screen.findByText('Your Breeze setting did not save. Try again.')).toBeInTheDocument();
  });

  // Offline, the question to the server fails as well, and what the control
  // shows is only what the rollback put back.
  it('goes back to what it was even when the server cannot be asked either', async () => {
    const user = userEvent.setup();
    mockedUsers.update.mockRejectedValue(new Error('offline'));
    mockedUsers.getById.mockRejectedValue(new Error('offline'));
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    await waitFor(() => expect(mockedUsers.getById).toHaveBeenCalled());
    await waitFor(() => expect(stored()).toBe('gusty'));
  });

  // Two failures in a row: the second choice's "before" is the first choice,
  // which was never saved either. Only the server knows what is stored.
  it('asks the server what is stored after a failure, so two in a row do not leave a choice that was never saved', async () => {
    const user = userEvent.setup();
    mockedUsers.update.mockRejectedValue(new Error('offline'));
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));
    await user.click(screen.getByRole('button', { name: 'still' }));

    await waitFor(() => expect(mockedUsers.getById).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(stored()).toBe('gusty'));
  });

  // Gusty then Calm, with the first request failing after the second was
  // chosen: putting Gusty's "before" back would undo Calm.
  it('does not undo a newer choice when an older one fails late', async () => {
    const user = userEvent.setup();
    auth.user = { _id: 'user-1', breeze: 'breezy' };
    let failFirst: (error: Error) => void = () => {};
    mockedUsers.update
      .mockReturnValueOnce(new Promise((_resolve, reject) => (failFirst = reject)))
      .mockResolvedValueOnce({} as never);
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'gusty' }));
    await user.click(screen.getByRole('button', { name: 'calm' }));
    failFirst(new Error('late'));

    // The first request's failure is not reported: the library only calls a
    // per-call callback for the latest call, and the latest one saved.
    await waitFor(() => expect(mockedUsers.update).toHaveBeenCalledTimes(2));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(stored()).toBe('calm');
    expect(screen.queryByText('Your Breeze setting did not save. Try again.')).not.toBeInTheDocument();
  });

  // Two requests in the air can land in either order, and whichever lands
  // last is what the server keeps. Sent one after the other, the last choice
  // is the last write.
  it('sends a choice only once the one before it has answered, so the last choice is the one stored', async () => {
    const user = userEvent.setup();
    let answerFirst: () => void = () => {};
    mockedUsers.update
      .mockReturnValueOnce(new Promise<never>(resolve => (answerFirst = () => resolve({} as never))))
      .mockResolvedValueOnce({} as never);
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'breezy' }));
    await user.click(screen.getByRole('button', { name: 'calm' }));

    expect(stored()).toBe('calm');
    expect(mockedUsers.update).toHaveBeenCalledTimes(1);
    expect(mockedUsers.update).toHaveBeenLastCalledWith('user-1', { breeze: 'breezy' });

    answerFirst();

    await waitFor(() => expect(mockedUsers.update).toHaveBeenCalledTimes(2));
    expect(mockedUsers.update).toHaveBeenLastCalledWith('user-1', { breeze: 'calm' });
    expect(stored()).toBe('calm');
  });

  it("keeps one person's choice from showing for another", async () => {
    const user = userEvent.setup();
    const view = renderProbe();
    await user.click(screen.getByRole('button', { name: 'still' }));
    expect(stored()).toBe('still');

    auth.user = { _id: 'user-2', breeze: 'calm' };
    view.rerender(
      <BreezeProvider>
        <Probe />
      </BreezeProvider>,
    );

    expect(stored()).toBe('calm');
  });
});

describe('a system that asks for reduced motion', () => {
  beforeEach(() => {
    media = stubMatchMedia({ [REDUCED]: true });
  });

  it('holds the wind still and leaves the stored choice alone', () => {
    renderProbe();

    expect(level()).toBe('still');
    expect(stored()).toBe('gusty');
    expect(screen.getByTestId('reduced')).toHaveTextContent('true');
  });

  it('still lets the choice change, which applies on every other device', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    expect(stored()).toBe('calm');
    expect(level()).toBe('still');
    expect(mockedUsers.update).toHaveBeenCalledWith('user-1', { breeze: 'calm' });
  });

  it('gives the stored choice back the moment the preference is lifted', () => {
    renderProbe();
    expect(level()).toBe('still');

    media.set(REDUCED, false);

    expect(level()).toBe('gusty');
    expect(screen.getByTestId('reduced')).toHaveTextContent('false');
  });

  it('follows the preference when it is switched on while the page is open', () => {
    media.set(REDUCED, false);
    renderProbe();
    expect(level()).toBe('gusty');

    media.set(REDUCED, true);

    expect(level()).toBe('still');
    expect(stored()).toBe('gusty');
  });
});

describe('the copy kept for the signed out screen', () => {
  const remembered = () => window.localStorage.getItem('bb.breeze');

  beforeEach(() => window.localStorage.clear());

  it('is written when the signed in user is known', () => {
    renderProbe();

    expect(remembered()).toBe('gusty');
  });

  it('is written again whenever the choice changes', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    expect(remembered()).toBe('calm');
  });

  it('follows the stored choice back when the save fails', async () => {
    const user = userEvent.setup();
    mockedUsers.update.mockRejectedValue(new Error('offline'));
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'calm' }));

    await waitFor(() => expect(remembered()).toBe('gusty'));
  });

  it('is not overwritten by the reduced motion preference', () => {
    media = stubMatchMedia({ [REDUCED]: true });
    renderProbe();

    expect(level()).toBe('still');
    expect(remembered()).toBe('gusty');
  });

  it('is left alone when nobody is signed in, and when the user signs out', () => {
    window.localStorage.setItem('bb.breeze', 'calm');
    auth.user = null;
    const view = renderProbe();
    expect(remembered()).toBe('calm');

    auth.user = { _id: 'user-1', breeze: 'gusty' };
    view.rerender(
      <BreezeProvider>
        <Probe />
      </BreezeProvider>,
    );
    expect(remembered()).toBe('gusty');

    auth.user = null;
    view.rerender(
      <BreezeProvider>
        <Probe />
      </BreezeProvider>,
    );
    expect(remembered()).toBe('gusty');
  });

  it('does not break the provider when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderProbe();

    expect(stored()).toBe('gusty');
    vi.restoreAllMocks();
  });
});

describe('with no provider', () => {
  it('is a still sky that cannot be changed, so a component can be rendered on its own', async () => {
    const user = userEvent.setup();
    renderWithQuery(<Probe />);

    await user.click(screen.getByRole('button', { name: 'gusty' }));

    expect(level()).toBe('still');
    expect(stored()).toBe('still');
    expect(mockedUsers.update).not.toHaveBeenCalled();
  });
});
