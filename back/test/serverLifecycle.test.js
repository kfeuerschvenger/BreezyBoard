import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import env from '../src/config/env.js';
import { startBoardPurgeJob } from '../src/jobs/boardPurge.job.js';
import Board from '../src/models/Board.js';
import { startServer } from '../src/startServer.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { registerUser } from './helpers/user.factory.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('purge job default wiring', () => {
  let stop;
  let owner;
  let colors;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.restoreAllMocks();
  });

  const deletedBoard = async ageMs => {
    const board = await createBoard(owner.token, colors.boardColor._id);
    await Board.updateOne({ _id: board._id }, { deletedAt: new Date(Date.now() - ageMs) });
    return board._id;
  };

  test('the default purge uses the configured retention window', async () => {
    const past = await deletedBoard(env.BOARD_RETENTION_MS + DAY_MS);
    const inside = await deletedBoard(env.BOARD_RETENTION_MS - DAY_MS);

    stop = startBoardPurgeJob({ intervalMs: 60 * 60 * 1000 });

    await vi.waitFor(async () => expect(await Board.countDocuments({ _id: past })).toBe(0));
    expect(await Board.countDocuments({ _id: inside })).toBe(1);
  });

  test('the default schedule uses the configured interval', () => {
    const timer = vi.spyOn(globalThis, 'setInterval');

    stop = startBoardPurgeJob();

    expect(timer).toHaveBeenCalledWith(expect.any(Function), env.BOARD_PURGE_INTERVAL_MS);
  });
});

describe('server start and shutdown', () => {
  const harness = () => {
    const calls = [];
    const stopPurge = vi.fn(() => calls.push('stopPurge'));
    const fakeServer = {
      close: vi.fn(callback => {
        calls.push('serverClose');
        return callback();
      }),
    };
    const application = {
      listen: vi.fn((_port, onListening) => {
        calls.push('listen');
        onListening();
        return fakeServer;
      }),
    };
    const options = {
      application,
      port: 4321,
      connect: vi.fn(async () => calls.push('connect')),
      startPurge: vi.fn(() => {
        calls.push('startPurge');
        return stopPurge;
      }),
      closeDatabase: vi.fn(async () => calls.push('closeDatabase')),
      exit: vi.fn(code => calls.push(`exit ${code}`)),
      signals: new EventEmitter(),
    };

    return { calls, stopPurge, fakeServer, options };
  };

  test('connects, listens and then starts the purge job, once', async () => {
    const { calls, options } = harness();

    await startServer(options);

    expect(calls).toEqual(['connect', 'listen', 'startPurge']);
    expect(options.application.listen).toHaveBeenCalledWith(4321, expect.any(Function));
    expect(options.startPurge).toHaveBeenCalledTimes(1);
  });

  test.each(['SIGINT', 'SIGTERM'])('%s stops the purge, drains the server, closes the database and exits', async signal => {
    const { calls, stopPurge, options } = harness();

    await startServer(options);
    options.signals.emit(signal);
    await vi.waitFor(() => expect(options.exit).toHaveBeenCalledWith(0));

    expect(stopPurge).toHaveBeenCalledTimes(1);
    expect(calls.slice(3)).toEqual(['stopPurge', 'serverClose', 'closeDatabase', 'exit 0']);
  });

  test('exits even when the database refuses to close', async () => {
    const { options } = harness();
    options.closeDatabase = vi.fn(async () => {
      throw new Error('already closed');
    });

    await startServer(options);
    options.signals.emit('SIGTERM');

    await vi.waitFor(() => expect(options.exit).toHaveBeenCalledWith(0));
  });

  test('does not start the purge job when the database never connects', async () => {
    const { options } = harness();
    options.connect = vi.fn(async () => {
      throw new Error('no database');
    });

    await expect(startServer(options)).rejects.toThrow('no database');

    expect(options.startPurge).not.toHaveBeenCalled();
    expect(options.application.listen).not.toHaveBeenCalled();
  });
});
