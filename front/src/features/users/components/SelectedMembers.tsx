import React from 'react';
import { IconUserPlus, IconX } from '@tabler/icons-react';
import type { User } from '@/models';
import { Avatar, Icon } from '@/shared/ui';

export interface SelectedMembersProps {
  members: User[];
  onRemove: (member: User) => void;
}

const fullName = (member: User) => `${member.firstName} ${member.lastName}`;

/** The people chosen so far, each removable from its own chip. */
export const SelectedMembers: React.FC<SelectedMembersProps> = ({ members, onRemove }) => {
  if (members.length === 0) return null;

  return (
    <div className="border-b border-line-10 bg-sky-tint p-6">
      <div className="mb-3 flex items-center gap-2 text-sky-deep">
        <Icon as={IconUserPlus} size={16} aria-hidden="true" />
        <span className="text-sm font-medium">
          {members.length} member{members.length > 1 ? 's' : ''} selected
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {members.map(member => (
          <div
            key={member._id}
            className="flex items-center gap-2 rounded-full border border-line-14 bg-surface px-3 py-1"
          >
            <Avatar name={fullName(member)} src={member.avatar} size="sm" decorative className="size-5 text-[10px]" />
            <span className="text-sm text-ink-body">{fullName(member)}</span>
            <button
              type="button"
              onClick={() => onRemove(member)}
              aria-label={`Remove ${fullName(member)}`}
              className="focus-ring cursor-pointer rounded-full text-ink-secondary hover:text-ink"
            >
              <Icon as={IconX} size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SelectedMembers;
