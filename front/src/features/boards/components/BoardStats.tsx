import React from 'react';
import { IconCalendar, IconFolder, IconUsers } from '@tabler/icons-react';
import { StatTile, Icon } from '@/shared/ui';
import type { StatTileTone } from '@/shared/ui';
import type { DashboardStats } from '@/models';

export interface BoardStatsProps {
  stats: DashboardStats;
}

/**
 * The row of totals above the board grid.
 *
 * The fourth tile carries a drawn ring rather than an icon from the set,
 * which is the only reason `icon` is a node instead of a component.
 */
const TILES: { key: keyof DashboardStats; label: string; tone: StatTileTone; icon: React.ReactNode }[] = [
  { key: 'totalBoards', label: 'Total Boards', tone: 'blue', icon: <Icon as={IconFolder} className="text-blue-600" size={20} /> },
  { key: 'totalMembers', label: 'Team Members', tone: 'green', icon: <Icon as={IconUsers} className="text-green-600" size={20} /> },
  { key: 'totalTasks', label: 'Total Tasks', tone: 'orange', icon: <Icon as={IconCalendar} className="text-orange-600" size={20} /> },
  {
    key: 'avgProgress',
    label: 'Avg Progress',
    tone: 'purple',
    icon: (
      <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
        <div className="w-2 h-2 bg-white rounded-full" />
      </div>
    ),
  },
];

export const BoardStats: React.FC<BoardStatsProps> = ({ stats }) => (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    {TILES.map(({ key, label, tone, icon }, index) => (
      <StatTile
        key={key}
        icon={icon}
        tone={tone}
        label={label}
        value={key === 'avgProgress' ? `${stats[key]}%` : stats[key]}
        delay={(index + 1) * 0.1}
      />
    ))}
  </div>
);

export default BoardStats;
