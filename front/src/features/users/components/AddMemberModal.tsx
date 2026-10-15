import React, { useEffect, useRef, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import type { User } from '@/models';
import { Button, Modal, Icon } from '@/shared/ui';
import { FIELD_BORDER, FIELD_CLASSES } from '@/shared/ui/fieldStyles';
import { useMemberSearch } from '../hooks/useMemberSearch';
import { MemberSearchResults } from './MemberSearchResults';
import { SelectedMembers } from './SelectedMembers';

export interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the people chosen, once the choice is confirmed. */
  onAddMembers: (members: User[]) => void;
  boardTitle?: string;
  boardId?: string;
}

/**
 * Search for people and add them to a board.
 *
 * The backdrop, the panel, the animation, the escape handler and the close
 * button come from the shared Modal, which also traps focus and restores it
 * to whatever opened the dialog. That was finding P3-4, the modal shell
 * written out four times.
 */
export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  open,
  onClose,
  onAddMembers,
  boardTitle = '',
  boardId,
}) => {
  const [selected, setSelected] = useState<User[]>([]);
  const search = useMemberSearch(boardId, open);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      return;
    }

    // Focus the search field shortly after opening, so typing works without
    // reaching for the mouse first. The delay lets the Modal finish its own
    // focus handling rather than fighting it.
    const timer = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open]);

  const toggle = (member: User) =>
    setSelected(previous =>
      previous.some(entry => entry._id === member._id)
        ? previous.filter(entry => entry._id !== member._id)
        : [...previous, member]
    );

  const confirm = () => {
    if (selected.length === 0) return;
    onAddMembers(selected);
    setSelected([]);
    onClose();
  };

  const close = () => {
    setSelected([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add Members"
      subtitle={boardTitle ? `Add team members to "${boardTitle}"` : 'Add team members'}
      footer={
        <>
          <p className="text-sm text-ink-secondary">
            {selected.length} member{selected.length !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={selected.length === 0}>
              Add {selected.length > 0 ? selected.length : ''} Member{selected.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-6">
        <div className="border-b border-line-10 py-4 md:p-6">
          <div className="relative">
            <Icon
              as={IconSearch}
              size={20}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search team members..."
              value={search.term}
              onChange={event => search.setTerm(event.target.value)}
              className={`${FIELD_CLASSES} ${FIELD_BORDER} h-12 rounded-field pl-11 pr-4`}
              aria-label="Search team members"
            />
          </div>
        </div>

        <SelectedMembers members={selected} onRemove={toggle} />

        <div className="flex-1 overflow-y-auto">
          <div className="py-4 md:p-6">
            <MemberSearchResults
              members={search.results}
              selectedIds={selected.map(member => member._id)}
              isLoading={search.isLoading}
              error={search.error}
              onToggle={toggle}
              onRetry={search.retry}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AddMemberModal;
