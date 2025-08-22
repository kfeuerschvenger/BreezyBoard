import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { UserService } from '@/services';
import type { User } from '@/models';

const AddMemberModal = ({ open, onClose, onAddMembers, boardTitle, boardId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [availableMembers, setAvailableMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Resetear estado al cerrar
      setSearchTerm('');
      setSelectedMembers([]);
      setAvailableMembers([]);
      return;
    }

    const fetchMembers = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const members = await UserService.search(searchTerm, boardId);
        setAvailableMembers(members);
      } catch (err) {
        console.error('Error fetching members:', err);
        setError('Failed to load team members');
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchMembers();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, open, boardId]);

  const handleMemberToggle = (member: User) => {
    setSelectedMembers(prev => {
      const isSelected = prev.find(m => m._id === member._id);
      if (isSelected) {
        return prev.filter(m => m._id !== member._id);
      } else {
        return [...prev, member];
      }
    });
  };

  const handleAddMembers = () => {
    if (selectedMembers.length > 0) {
      onAddMembers(selectedMembers);
      setSelectedMembers([]);
      setSearchTerm('');
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedMembers([]);
    setSearchTerm('');
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 font-heading">Add Members</h2>
              <p className="text-sm text-gray-600 font-body mt-1">Add team members to "{boardTitle}"</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Search */}
          <div className="p-6 border-b border-gray-200">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search team members..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-body"
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
                    const isSelected = selectedMembers.find(m => m._id === member._id);
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

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600 font-body">
              {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-body cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMembers}
                disabled={selectedMembers.length === 0}
                className={`px-6 py-2 rounded-lg transition-colors font-body ${
                  selectedMembers.length > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Add {selectedMembers.length > 0 ? selectedMembers.length : ''} Member
                {selectedMembers.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddMemberModal;
