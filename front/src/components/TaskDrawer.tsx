import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, User, Palette, Flag, GripVertical } from 'lucide-react';
import { ColorService, UserService } from '@/services';
import type { User as UserModel, Task } from '@/models';
import SimpleUserAvatar from './SimpleUserAvatar';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface UserSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  members: UserModel[];
}

interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  task?: Partial<Task> | null;
  onSave: (task: Partial<Task>) => Promise<void>;
}

interface ChecklistItemData {
  id: string;
  text: string;
  completed: boolean;
}

// ----------------------
// Sortable Checklist Item Component
// ----------------------
interface SortableChecklistItemProps {
  item: ChecklistItemData;
  onUpdate: (id: string, field: string, value: string | boolean) => void;
  onDelete: (id: string) => void;
}

const SortableChecklistItem: React.FC<SortableChecklistItemProps> = ({ item, onUpdate, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-lg ${isDragging ? 'bg-blue-50' : 'bg-white'}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 p-1">
        <GripVertical size={14} />
      </div>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={e => onUpdate(item.id, 'completed', e.target.checked)}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <input
        type="text"
        value={item.text}
        onChange={e => onUpdate(item.id, 'text', e.target.value)}
        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent font-body"
        placeholder="Enter checklist item"
      />
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="p-1 text-red-600 hover:text-red-700 cursor-pointer"
        aria-label="Delete checklist item"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

// ----------------------
// User search component
// ----------------------
const UserSearchInput: React.FC<UserSearchInputProps> = ({ value, onChange, members }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<UserModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserModel | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Initialize selected user when value (owner id) or members change
  useEffect(() => {
    let mounted = true;
    if (!value) {
      if (mounted) {
        setSelectedUser(null);
        setSearchTerm('');
      }
      return;
    }

    const found = members.find(m => String(m._id) === String(value));
    if (found) {
      setSelectedUser(found);
      setSearchTerm(`${found.firstName} ${found.lastName}`);
      setSuggestions([]);
      return;
    }

    // If not in members, attempt to fetch the user by id
    (async () => {
      try {
        setIsSearching(true);
        const user = await UserService.getById(value);
        if (!mounted) return;
        setSelectedUser(user);
        setSearchTerm(`${user.firstName} ${user.lastName}`);
        setSuggestions([]);
      } catch {
        if (!mounted) return;
        setSelectedUser(null);
        setSearchTerm('');
        setSuggestions([]);
      } finally {
        if (mounted) setIsSearching(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [value, members]);

  // Debounced filtering of members
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    const query = searchTerm.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    if (selectedUser) {
      const fullName = `${selectedUser.firstName} ${selectedUser.lastName}`.trim();
      if (query === fullName.toLowerCase() || query === fullName) {
        setSuggestions([]);
        setIsSearching(false);
        return;
      }
    }

    setIsSearching(true);
    debounceRef.current = window.setTimeout(() => {
      const lowerCaseQuery = query.toLowerCase();
      const filtered = members.filter(member => {
        const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
        return (
          fullName.includes(lowerCaseQuery) ||
          (member.email && member.email.toLowerCase().includes(lowerCaseQuery)) ||
          (member.role && String(member.role).toLowerCase().includes(lowerCaseQuery))
        );
      });
      setSuggestions(filtered.slice(0, 10));
      setIsSearching(false);
    }, 220);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm, members, selectedUser]);

  const handleInputChange = (inputValue: string) => {
    if (selectedUser) {
      const fullName = `${selectedUser.firstName} ${selectedUser.lastName}`.trim();
      if (inputValue !== fullName) {
        setSelectedUser(null);
        onChange('');
      }
    }
    setSearchTerm(inputValue);
  };

  const handleSelectUser = (user: UserModel) => {
    setSelectedUser(user);
    setSearchTerm(`${user.firstName} ${user.lastName}`);
    setSuggestions([]);
    onChange(user._id);
  };

  const handleClear = () => {
    setSelectedUser(null);
    setSearchTerm('');
    setSuggestions([]);
    onChange('');
  };

  return (
    <div className="relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <User size={16} className="text-gray-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={e => handleInputChange(e.target.value)}
          placeholder="Search team members..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Search team members"
        />
        {selectedUser && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
            aria-label="Clear selected user"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map(user => (
            <div
              key={user._id}
              className="p-3 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
              onClick={() => handleSelectUser(user)}
            >
              <SimpleUserAvatar user={user} size="sm" />
              <div>
                <p className="font-medium">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isSearching && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-gray-600 text-center">Searching users...</p>
        </div>
      )}
    </div>
  );
};

// ----------------------
// TaskDrawer component
// ----------------------
const TaskDrawer: React.FC<TaskDrawerProps> = ({ open, onClose, task = null, onSave }) => {
  const [isLoadingColors, setIsLoadingColors] = useState(true);
  const [taskColors, setTaskColors] = useState<Array<{ _id: string; name?: string; value: string }>>([]);
  const [boardMembers, setBoardMembers] = useState<UserModel[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    color: '',
    owner: '',
    checklist: [] as ChecklistItemData[],
  });
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
    owner?: string;
    color?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DnD sensors for checklist reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load colors
  useEffect(() => {
    let mounted = true;
    const fetchColors = async () => {
      try {
        setIsLoadingColors(true);
        const colors = await ColorService.getByType('task');
        if (!mounted) return;
        setTaskColors(colors ?? []);

        // Preselect first color for new tasks
        if (!task && colors && colors.length > 0) {
          setFormData(prev => ({
            ...prev,
            color: prev.color || colors[0]._id,
          }));
        }
      } catch (error) {
        console.error('Failed to load colors', error);
        if (mounted) setTaskColors([]);
      } finally {
        if (mounted) setIsLoadingColors(false);
      }
    };

    fetchColors();
    return () => {
      mounted = false;
    };
  }, [task]);

  // Load board members when task.boardId changes
  useEffect(() => {
    let mounted = true;
    const fetchMembers = async () => {
      if (!task?.boardId) {
        if (mounted) setBoardMembers([]);
        return;
      }
      try {
        const members = await UserService.getBoardMembers(task.boardId);
        if (!mounted) return;
        setBoardMembers(members);

        // Preselect the only member if there's only one
        if (!task && members.length === 1) {
          setFormData(prev => ({
            ...prev,
            owner: prev.owner || members[0]._id,
          }));
        }
      } catch (error) {
        console.error('Failed to load board members', error);
        if (mounted) setBoardMembers([]);
      }
    };

    fetchMembers();
    return () => {
      mounted = false;
    };
  }, [task]);

  // Update form when task or taskColors change
  useEffect(() => {
    if (!task) {
      setErrors({});
      return;
    }

    // Determine color id from task.color
    let colorId = '';
    if (task.color) {
      if (typeof task.color === 'object') {
        colorId = (task.color as any)._id ?? '';
      } else if (typeof task.color === 'string') {
        const foundByValue = taskColors.find(c => c.value.toLowerCase() === String(task.color).toLowerCase());
        colorId = foundByValue?._id ?? String(task.color);
      }
    }

    // Determine owner id from task.owner
    let ownerId = '';
    if (task.owner) {
      if (typeof task.owner === 'object') {
        ownerId = (task.owner as any)._id ?? '';
      } else {
        ownerId = task.owner;
      }
    }

    setFormData({
      title: task.title ?? '',
      description: task.description ?? '',
      priority: task.priority ?? 'medium',
      color: colorId,
      owner: ownerId,
      checklist:
        task.checklist?.map(item => ({
          id: (item._id as string) ?? (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString()),
          text: item.text,
          completed: item.completed,
        })) ?? [],
    });

    setErrors({});
  }, [task, taskColors]);

  const priorities = [
    { value: 'low', label: 'Low', color: 'bg-green-100 text-green-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-red-100 text-red-800' },
  ];

  // Validate form function
  const validateForm = (): boolean => {
    const newErrors: { title?: string; description?: string; owner?: string; color?: string } = {};
    let isValid = true;

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
      isValid = false;
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
      isValid = false;
    }

    if (!formData.owner) {
      newErrors.owner = 'Owner is required';
      isValid = false;
    }

    if (!formData.color) {
      newErrors.color = 'Color is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Check if form is valid for submission
  const isFormValid = (): boolean => {
    return (
      formData.title.trim() !== '' &&
      formData.description.trim() !== '' &&
      formData.owner !== '' &&
      formData.color !== '' &&
      Object.keys(errors).length === 0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const taskData: Partial<Task> = {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        color: formData.color,
        owner: formData.owner,
        checklist: formData.checklist.map(item => ({
          text: item.text,
          completed: item.completed,
          ...(item.id && !item.id.startsWith('temp-') && { _id: item.id }),
        })),
      };

      if (task && task._id) {
        taskData._id = task._id;
        taskData.boardId = task.boardId;
        taskData.status = task.status;
      } else if (task) {
        taskData.boardId = task.boardId;
        taskData.status = task.status;
      }

      await onSave(taskData);
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChecklistAdd = () => {
    setFormData(prev => ({
      ...prev,
      checklist: [
        ...prev.checklist,
        {
          id: crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          text: '',
          completed: false,
        },
      ],
    }));
  };

  const handleChecklistUpdate = (id: string, field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.map(item => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const handleChecklistDelete = (id: string) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter(item => item.id !== id),
    }));
  };

  const handleChecklistReorder = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setFormData(prev => {
        const oldIndex = prev.checklist.findIndex(item => item.id === active.id);
        const newIndex = prev.checklist.findIndex(item => item.id === over.id);

        return {
          ...prev,
          checklist: arrayMove(prev.checklist, oldIndex, newIndex),
        };
      });
    }
  };

  const handleOwnerChange = (ownerId: string) => {
    setFormData(prev => ({ ...prev, owner: ownerId }));
    setErrors(prev => ({ ...prev, owner: undefined }));
  };

  const drawerTitle = task?._id ? 'Edit Task' : 'Create New Task';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl z-50 overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 font-heading">{drawerTitle}</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-heading">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.title ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter task title"
                    aria-required
                  />
                  {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-heading">Description *</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-body ${
                      errors.description ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter task description"
                  />
                  {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-heading">
                    <User size={16} className="inline mr-1" />
                    Owner *
                  </label>
                  <UserSearchInput value={formData.owner} onChange={handleOwnerChange} members={boardMembers} />
                  {errors.owner && <p className="mt-1 text-sm text-red-600">{errors.owner}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-heading">
                    <Flag size={16} className="inline mr-1" />
                    Priority
                  </label>
                  <div className="flex gap-2">
                    {priorities.map(priority => (
                      <button
                        key={priority.value}
                        type="button"
                        onClick={() =>
                          setFormData(prev => ({ ...prev, priority: priority.value as 'low' | 'medium' | 'high' }))
                        }
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                          formData.priority === priority.value
                            ? priority.color
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {priority.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-heading">
                    <Palette size={16} className="inline mr-1" />
                    Color *
                  </label>
                  {isLoadingColors ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {taskColors.map(color => (
                          <button
                            key={color._id}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, color: color._id }))}
                            className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                              formData.color === color._id
                                ? 'border-gray-900 scale-110 ring-2 ring-blue-500'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                            style={{ backgroundColor: color.value }}
                            aria-label={color.name ?? color.value}
                          />
                        ))}
                      </div>
                      {errors.color && <p className="mt-1 text-sm text-red-600">{errors.color}</p>}
                    </>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700 font-heading">Checklist</label>
                    <button
                      type="button"
                      onClick={handleChecklistAdd}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <Plus size={16} />
                      Add Item
                    </button>
                  </div>

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChecklistReorder}>
                    <SortableContext
                      items={formData.checklist.map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {formData.checklist.map(item => (
                          <SortableChecklistItem
                            key={item.id}
                            item={item}
                            onUpdate={handleChecklistUpdate}
                            onDelete={handleChecklistDelete}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={!isFormValid() || isSubmitting}
                    className={`flex-1 py-2 px-4 rounded-lg transition-colors font-medium cursor-pointer ${
                      !isFormValid() || isSubmitting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TaskDrawer;
