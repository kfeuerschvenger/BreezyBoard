import React from 'react';
import type { Task } from '@/models';
import { Drawer } from '@/shared/ui';
import { useTaskDrawer } from '../hooks/useTaskDrawer';
import { TaskForm, TaskFormActions } from './TaskForm';

export interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  task?: Partial<Task> | null;
  onSave: (task: Partial<Task>) => Promise<void>;
}

/**
 * The drawer around the task form: a shell, a title and the form's two buttons.
 *
 * Section 12.6 asks a page to read as composition, and the same target is
 * worth holding one level down. What this file used to hold instead is the
 * clearest measure of it: 852 lines of fetching, form state, a user search, a
 * checklist and a colour grid, all of which now live where they belong.
 */
const TaskDrawer: React.FC<TaskDrawerProps> = ({ open, onClose, task = null, onSave }) => {
  const drawer = useTaskDrawer({ open, task, onSave, onSaved: onClose });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={task?._id ? 'Edit Task' : 'Create New Task'}
      footer={<TaskFormActions isValid={drawer.isValid} isSubmitting={drawer.isSubmitting} onCancel={onClose} />}
    >
      <TaskForm {...drawer} />
    </Drawer>
  );
};

export default TaskDrawer;
