import Board from '../models/Board.js';
import Task from '../models/Task.js';
import { visibleBoardFilter } from './board.service.js';

export const getDashboardStats = async userId => {
  // The same boards the board list shows, by the same rule. Counting boards
  // the user cannot open would make every total on the dashboard disagree
  // with the page it summarizes.
  const boards = await Board.find(await visibleBoardFilter(userId)).lean();

  // Calcular estadísticas
  const totalBoards = boards.length;

  // Calcular miembros únicos
  const uniqueMemberIds = new Set();
  boards.forEach(board => {
    // Agregar creador
    if (board.createdBy) {
      uniqueMemberIds.add(board.createdBy.toString());
    }

    // Agregar miembros
    if (board.members && board.members.length > 0) {
      board.members.forEach(member => {
        uniqueMemberIds.add(member.toString());
      });
    }
  });
  const totalMembers = uniqueMemberIds.size;

  // Obtener total de tareas
  const boardIds = boards.map(b => b._id);
  const totalTasks = await Task.countDocuments({
    boardId: { $in: boardIds },
  });

  // Calcular progreso promedio
  const progressSum = boards.reduce((sum, board) => {
    return sum + (board.progress || 0);
  }, 0);
  const avgProgress = totalBoards > 0 ? Math.round(progressSum / totalBoards) : 0;

  return {
    totalBoards,
    totalMembers,
    totalTasks,
    avgProgress,
  };
};
