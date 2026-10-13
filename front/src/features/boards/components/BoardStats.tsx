import React from 'react';
import type { DashboardStats } from '@/models';

export interface BoardStatsProps {
  stats: DashboardStats;
}

const FIGURES: { key: keyof DashboardStats; label: string }[] = [
  { key: 'totalBoards', label: 'Total Boards' },
  { key: 'totalMembers', label: 'Team Members' },
  { key: 'totalTasks', label: 'Total Tasks' },
  { key: 'avgProgress', label: 'Avg Progress' },
];

/**
 * The four totals across every board, as a row of figures for the home hero.
 *
 * A description list: each figure is a term and its value. The label comes
 * first in the markup, so it is read first, and `flex-col-reverse` draws the
 * number above it. The text is white on the hero's gradient and the hero
 * keeps its darkest stops under the left half, where this sits, so the
 * contrast is measured on the hero and not assumed here.
 */
export const BoardStats: React.FC<BoardStatsProps> = ({ stats }) => (
  <dl className="flex flex-wrap gap-x-8 gap-y-4">
    {FIGURES.map(({ key, label }) => (
      <div key={key} className="flex flex-col-reverse gap-1">
        <dt className="text-[13px] font-medium text-white">{label}</dt>
        <dd className="font-heading text-[28px] font-bold leading-none tracking-tight text-white">
          {key === 'avgProgress' ? `${stats[key]}%` : stats[key]}
        </dd>
      </div>
    ))}
  </dl>
);

export default BoardStats;
