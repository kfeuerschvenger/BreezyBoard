import Board from '../models/Board.js';
import { summariseBoardTasks, visibleBoardFilter } from './board.service.js';

export const getDashboardStats = async userId => {
  // The same boards the board list shows, by the same rule. Counting boards
  // the user cannot open would make every total on the dashboard disagree
  // with the page it summarizes.
  const boards = await Board.find(await visibleBoardFilter(userId)).lean();

  const totalBoards = boards.length;

  // Distinct people across every board, creators included, counted once each
  // however many boards they appear on.
  const uniqueMemberIds = new Set();
  for (const board of boards) {
    if (board.createdBy) {
      uniqueMemberIds.add(board.createdBy.toString());
    }

    for (const member of board.members ?? []) {
      uniqueMemberIds.add(member.toString());
    }
  }

  // One aggregation replaces both the separate task count and the progress
  // sum. The old code summed `board.progress`, a virtual that is undefined
  // here because this query is lean and lean strips virtuals, so average
  // progress has been zero for every account that has ever used this
  // product.
  const summaries = await summariseBoardTasks(boards);

  let totalTasks = 0;
  let progressSum = 0;

  for (const board of boards) {
    const summary = summaries.get(board._id.toString());

    totalTasks += summary?.total ?? 0;
    // A board with no tasks contributes zero rather than being skipped, so
    // the average is over boards rather than over boards that happen to have
    // work on them. An empty board is genuinely zero percent done.
    progressSum += summary?.progress ?? 0;
  }

  return {
    totalBoards,
    totalMembers: uniqueMemberIds.size,
    totalTasks,
    avgProgress: totalBoards > 0 ? Math.round(progressSum / totalBoards) : 0,
  };
};
