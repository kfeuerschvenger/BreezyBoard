import React, { useId } from 'react';
import { BreezeSetting } from '@/features/breeze';
import { Switch } from '@/shared/ui';
import { ProfilePanel } from './ProfilePanel';

interface ComingSoonRowProps {
  title: string;
  description: string;
}

/**
 * A preference that is not built yet, drawn as what it will be: a switch,
 * off, that cannot be turned on. It stays in the reading order, disabled and
 * not hidden, so a person can find out it is coming; a hint says when to expect
 * it, in words, because a dimmed switch alone says nothing to a screen reader.
 */
const ComingSoonRow: React.FC<ComingSoonRowProps> = ({ title, description }) => {
  const id = useId();

  return (
    <li className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p id={`${id}-title`} className="text-[15px] font-semibold text-ink">
          {title}
        </p>
        <p id={`${id}-note`} className="text-sm text-ink-secondary">
          {description}
        </p>
      </div>

      <Switch
        checked={false}
        disabled
        onCheckedChange={() => undefined}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-note`}
      />
    </li>
  );
};

/**
 * "Your breeze": the one preference that works, and the two that are coming.
 *
 * The Breeze level is the sidebar's setting at a larger size, one stored
 * value in two places. The reference design also has a switch for card sway;
 * there is none here, because sway is the Gusty level and nothing else, and a
 * second control for the same motion would let the two disagree.
 *
 * Due-date nudges need due dates and the weekly digest needs a scheduled
 * mail job, neither of which exists yet, so both are disabled.
 */
export const BreezePreferences: React.FC = () => (
  <ProfilePanel title="Your breeze" description="How much the interface moves, and what it tells you.">
    <BreezeSetting />

    <ul className="mt-4 divide-y divide-line-06 border-t border-line-06">
      <ComingSoonRow title="Due-date nudges" description="Coming soon: a reminder when a card is almost due." />
      <ComingSoonRow title="Weekly digest" description="Coming soon: a Monday email with what landed." />
    </ul>
  </ProfilePanel>
);

export default BreezePreferences;
