import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { UserService } from '@/services';
import type { User } from '@/models';
import { Button, Modal } from '@/shared/ui';

type AddMemberModalProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Called when user confirms adding members
   * Receives an array of selected User objects.
   */
  onAddMembers: (members: User[]) => void;
  boardTitle?: string;
  boardId?: string;
};

/**
 * AddMemberModal
 *
 * Reusable modal for searching and selecting users to add to a board.
 * - Debounced search (300ms)
 * - Prevents stale-response races using an internal request id
 * - Accessible: focuses search input on open, supports Esc/backdrop to close
 */
const AddMemberModal: React.FC<AddMemberModalProps> = ({ open, onClose, onAddMembers, boardTitle = '', boardId }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [availableMembers, setAvailableMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ref to the search input for focus management
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // request id to ignore stale responses
  const requestIdRef = useRef<number>(0);
  // mounted flag to avoid setting state after unmount
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Clear internal state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setSelectedMembers([]);
      setAvailableMembers([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    // focus the search input shortly after open for keyboard users
    const t = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  /**
   * Debounced fetch of members using searchTerm and boardId.
   * Uses requestIdRef to ignore out-of-order responses.
   */
  useEffect(() => {
    if (!open) return;

    const debounceMs = 300;
    const currentRequestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      let members: User[] = [];
      let fetchError: string | null = null;

      try {
        const res = await UserService.search(searchTerm, boardId);
        members = res || [];
      } catch (err) {
        console.error('Error fetching members:', err);
        fetchError = 'Failed to load team members';
        members = [];
      }

      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }

      // Apply results to state
      if (fetchError) {
        setError(fetchError);
        setAvailableMembers([]);
      } else {
        setAvailableMembers(members);
      }

      setIsLoading(false);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, open, boardId]);

  // Keyboard: close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleMemberToggle = useCallback((member: User) => {
    setSelectedMembers(prev => {
      const exists = prev.some(m => m._id === member._id);
      if (exists) return prev.filter(m => m._id !== member._id);
      return [...prev, member];
    });
  }, []);

  const handleAddMembers = useCallback(() => {
    if (selectedMembers.length === 0) return;
    onAddMembers(selectedMembers);
    // reset local state and close
    setSelectedMembers([]);
    setSearchTerm('');
    onClose();
  }, [onAddMembers, onClose, selectedMembers]);

  const handleClose = useCallback(() => {
    setSelectedMembers([]);
    setSearchTerm('');
    setAvailableMembers([]);
    setError(null);
    onClose();
  }, [onClose]);

  // The backdrop, the panel, the animation, the escape handler and the
  // close button all used to be written out here. They come from the shared
  // Modal now, which additionally traps focus and restores it to whatever
  // opened the dialog, neither of which this copy did. Finding P3-4, the
  // modal shell reimplemented four times.
  //
  // Only the shell moved. The member list further down is untouched on
  // purpose: P4-3 singles it out as the one autocomplete in this codebase
  // that was already keyboard operable, and there is nothing to gain from
  // rewriting the part that was right.
  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Members"
      subtitle={boardTitle ? `Add team members to "${boardTitle}"` : 'Add team members'}
      footer={
        <>
          <p className="text-sm text-gray-600 font-body">
            {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddMembers} disabled={selectedMembers.length === 0}>
              Add {selectedMembers.length > 0 ? selectedMembers.length : ''} Member
              {selectedMembers.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-6">
          {/* Search */}
          <div className="p-6 border-b border-gray-200">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search team members..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-body"
                aria-label="Search team members"
              />
            </div>
          </div>

          {/* Selected Members Summary */}
          {selectedMembers.length > 0 && (
            <div className="p-6 bg-blue-50 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus size={16} className="text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {selectedMembers.length} member{selectedMembers.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map(member => (
                  <div
                    key={member._id}
                    className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-blue-200"
                  >
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt={`${member.firstName} ${member.lastName}`}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                        {member.firstName?.[0]}
                        {member.lastName?.[0]}
                      </div>
                    )}
                    <span className="text-sm text-gray-700">
                      {member.firstName} {member.lastName}
                    </span>
                    <button
                      onClick={() => handleMemberToggle(member)}
                      aria-label={`Remove ${member.firstName} ${member.lastName}`}
                      className="text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
                  <p className="text-gray-500 font-body">Loading team members...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <X className="text-red-500" size={24} />
                  </div>
                  <p className="text-red-500 font-body">{error}</p>
                  <button
                    onClick={() => setSearchTerm('')}
                    className="mt-4 text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              ) : availableMembers.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="text-gray-400" size={24} />
                  </div>
                  <p className="text-gray-500 font-body">No members found matching your search</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableMembers.map(member => {
                    const isSelected = selectedMembers.some(m => m._id === member._id);
                    return (
                      <motion.div
                        key={member._id}
                        whileHover={{ scale: 1.01 }}
                        className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => handleMemberToggle(member)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleMemberToggle(member);
                          }
                        }}
                        aria-pressed={isSelected}
                      >
                        <div className="relative">
                          {member.avatar ? (
                            <img
                              src={member.avatar}
                              alt={`${member.firstName} ${member.lastName}`}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-12 h-12 flex items-center justify-center">
                              <span className="text-gray-400 text-xl font-bold">
                                {member.firstName?.[0]}
                                {member.lastName?.[0]}
                              </span>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 font-heading">
                            {member.firstName} {member.lastName}
                          </h3>
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
              )}
            </div>
          </div>

      </div>
    </Modal>
  );
};

export default AddMemberModal;
