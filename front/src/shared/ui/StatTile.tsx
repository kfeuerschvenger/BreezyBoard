import React from 'react';
import { motion } from 'framer-motion';

export type StatTileTone = 'blue' | 'green' | 'orange' | 'purple';

/**
 * Whole class names, never composed from the tone at runtime.
 *
 * A `bg-${tone}-100` would read correctly and produce an unstyled tile,
 * because Tailwind scans the source for complete class names and cannot see
 * one that only exists once the component runs. That is finding P4-6, which
 * reached the interface through the priority chips.
 */
const TONE_BACKGROUNDS: Record<StatTileTone, string> = {
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  orange: 'bg-orange-100',
  purple: 'bg-purple-100',
};

export interface StatTileProps {
  /** Decorative. The tile hides it from assistive technology. */
  icon: React.ReactNode;
  tone: StatTileTone;
  value: React.ReactNode;
  label: string;
  /** Seconds to stagger the entrance by, when several are shown as a row. */
  delay?: number;
}

/**
 * One figure with the word for what it counts.
 *
 * The icon is decoration: it repeats what the label already says, so it is
 * hidden rather than announced a second time under a name guessed from the
 * file it came from.
 */
export const StatTile: React.FC<StatTileProps> = ({ icon, tone, value, label, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
  >
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${TONE_BACKGROUNDS[tone]}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600">{label}</p>
      </div>
    </div>
  </motion.div>
);

export default StatTile;
