import React from 'react';
import { motion } from 'motion/react';
import { IconCheck, IconSearch, IconX } from '@tabler/icons-react';
import type { User } from '@/models';
import { Avatar, Icon } from '@/shared/ui';

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
  <div className="text-center py-8">{children}</div>
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
    return (
      <Centered>
        <div
          role="status"
          aria-label="Loading team members..."
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"
        />
        <p className="text-gray-500 font-body">Loading team members...</p>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <div
          className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"
          aria-hidden="true"
        >
          <Icon as={IconX} className="text-red-500" size={24} />
        </div>
        <p className="text-red-500 font-body">{error}</p>
        <button type="button" onClick={onRetry} className="mt-4 text-blue-600 hover:text-blue-800 cursor-pointer">
          Try again
        </button>
      </Centered>
    );
  }

  if (members.length === 0) {
    return (
      <Centered>
        <div
          className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"
          aria-hidden="true"
        >
          <Icon as={IconSearch} className="text-gray-400" size={24} />
        </div>
        <p className="text-gray-500 font-body">No members found matching your search</p>
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
            className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
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
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <Icon as={IconCheck} size={12} className="text-white" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <h3 className="font-medium text-gray-900 font-heading">{fullName(member)}</h3>
              <p className="text-sm text-gray-600 font-body">{member.role}</p>
              <p className="text-xs text-gray-500 font-body">{member.email}</p>
            </div>

            <div className="text-right">
              <span className="inline-block px-2 py-1 bg-gray-100 text-xs text-gray-600 rounded-full font-body">
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
