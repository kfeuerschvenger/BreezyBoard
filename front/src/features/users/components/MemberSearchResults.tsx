import React from 'react';
import { motion } from 'motion/react';
import { IconCheck, IconSearch, IconX } from '@tabler/icons-react';
import type { User } from '@/models';
import { Avatar, Button, Icon, LoadingScreen } from '@/shared/ui';

export interface MemberSearchResultsProps {
  members: User[];
  selectedIds: string[];
  isLoading: boolean;
  error: string | null;
  onToggle: (member: User) => void;
  /** Offered alongside the error, as the way to try the search again. */
  onRetry: () => void;
}

const fullName = (member: User) => `${member.firstName} ${member.lastName}`;

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="py-8 text-center">{children}</div>
);

/**
 * The people a search turned up, each one a toggle.
 *
 * Each row is a real toggle button with `aria-pressed`, reachable by Tab and
 * operable with Enter or Space. Section 12.5 singles this list out as the one
 * autocomplete in this codebase that was keyboard operable from the start,
 * which is why it moved unchanged apart from hiding the decorations.
 */
export const MemberSearchResults: React.FC<MemberSearchResultsProps> = ({
  members,
  selectedIds,
  isLoading,
  error,
  onToggle,
  onRetry,
}) => {
  if (isLoading) {
    return <LoadingScreen label="Loading team members..." showLabel fill="inline" />;
  }

  if (error) {
    return (
      <Centered>
        <div
          className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-danger-bg text-danger"
          aria-hidden="true"
        >
          <Icon as={IconX} size={24} />
        </div>
        <p className="text-danger-strong">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </Centered>
    );
  }

  if (members.length === 0) {
    return (
      <Centered>
        <div
          className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-line-06 text-ink-secondary"
          aria-hidden="true"
        >
          <Icon as={IconSearch} size={24} />
        </div>
        <p className="text-ink-secondary">No members found matching your search</p>
      </Centered>
    );
  }

  return (
    <div className="space-y-3">
      {members.map(member => {
        const isSelected = selectedIds.includes(member._id);

        return (
          <motion.div
            key={member._id}
            whileHover={{ scale: 1.01 }}
            className={`focus-ring flex cursor-pointer items-center gap-4 rounded-control border-2 p-4 transition-[background-color,border-color] ${
              isSelected
                ? 'border-sky-edge bg-sky-tint'
                : 'border-line-14 hover:border-line-22 hover:bg-surface-subtle'
            }`}
            onClick={() => onToggle(member)}
            role="button"
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggle(member);
              }
            }}
            aria-pressed={isSelected}
          >
            {/*
              The avatar and the tick repeat what the row already says, so
              they are hidden. Left exposed, the initials were announced
              immediately before the name they are initials of.
            */}
            <div className="relative" aria-hidden="true">
              <Avatar name={fullName(member)} src={member.avatar} size="lg" decorative />
              {isSelected && (
                <div className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-ink text-white">
                  <Icon as={IconCheck} size={12} />
                </div>
              )}
            </div>

            <div className="flex-1">
              <h3 className="font-heading font-medium text-ink">{fullName(member)}</h3>
              <p className="text-sm text-ink-secondary">{member.role}</p>
              <p className="text-xs text-ink-secondary">{member.email}</p>
            </div>

            <div className="text-right">
              <span className="inline-block rounded-full bg-line-06 px-2 py-1 text-xs text-ink-secondary">
                {member.department}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default MemberSearchResults;
