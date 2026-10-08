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
    <div className="p-6 bg-blue-50 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Icon as={IconUserPlus} size={16} className="text-blue-600" aria-hidden="true" />
        <span className="text-sm font-medium text-blue-900">
          {members.length} member{members.length > 1 ? 's' : ''} selected
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {members.map(member => (
          <div
            key={member._id}
            className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-blue-200"
          >
            <Avatar name={fullName(member)} src={member.avatar} size="sm" decorative className="w-5 h-5 text-[10px]" />
            <span className="text-sm text-gray-700">{fullName(member)}</span>
            <button
              type="button"
              onClick={() => onRemove(member)}
              aria-label={`Remove ${fullName(member)}`}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
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
