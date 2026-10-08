import React from 'react';
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface ChecklistItemData {
  id: string;
  text: string;
  completed: boolean;
}

export interface ChecklistProps {
  items: ChecklistItemData[];
  onChange: (items: ChecklistItemData[]) => void;
}

interface SortableChecklistItemProps {
  item: ChecklistItemData;
  onUpdate: (id: string, field: 'text' | 'completed', value: string | boolean) => void;
  onDelete: (id: string) => void;
}

const newItemId = (): string => (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString());

/** A square control box: 44 pixels on a phone, where it is touched, and 28 where a pointer is precise. */
const TARGET = 'flex h-11 w-11 shrink-0 items-center justify-center md:h-7 md:w-7';

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
      <div
        {...attributes}
        {...listeners}
        aria-label="Reorder checklist item"
        className={`${TARGET} cursor-grab active:cursor-grabbing text-gray-400`}
      >
        <Icon as={IconGripVertical} size={14} aria-hidden="true" />
      </div>
      <label className={`${TARGET} cursor-pointer`}>
        <input
          type="checkbox"
          checked={item.completed}
          onChange={event => onUpdate(item.id, 'completed', event.target.checked)}
          aria-label="Completed"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={item.text}
        onChange={event => onUpdate(item.id, 'text', event.target.value)}
        className="min-w-0 flex-1 px-2 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent font-body"
        placeholder="Enter checklist item"
      />
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className={`${TARGET} text-red-600 hover:text-red-700 cursor-pointer`}
        aria-label="Delete checklist item"
      >
        <Icon as={IconTrash} size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * A reorderable checklist, owning its drag sensors and the four edits that
 * can be made to the list.
 *
 * It reports the whole list back through `onChange` rather than the single
 * edit that produced it, so the caller stores a list and never has to know
 * which of add, edit, remove or reorder happened.
 */
export const Checklist: React.FC<ChecklistProps> = ({ items, onChange }) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAdd = () => {
    onChange([...items, { id: newItemId(), text: '', completed: false }]);
  };

  const handleUpdate = (id: string, field: 'text' | 'completed', value: string | boolean) => {
    onChange(items.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleDelete = (id: string) => {
    onChange(items.filter(item => item.id !== id));
  };

  const handleReorder = (event: DragEndEvent) => {
    const { active, over } = event;

    // A null `over` means the drag ended outside any valid drop target, so
    // there is nothing to reorder.
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(item => item.id === active.id);
    const newIndex = items.findIndex(item => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onChange(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {/* A heading rather than a label: it names a section, not a control,
            which is what made it one of the six orphan labels the gate was
            holding. h3 because the drawer title is an h2. */}
        <h3 className="text-sm font-medium text-gray-700 font-heading">Checklist</h3>
        <button
          type="button"
          onClick={handleAdd}
          className="flex min-h-11 items-center gap-1 px-1 text-sm text-blue-600 hover:text-blue-700 cursor-pointer md:min-h-7"
        >
          <Icon as={IconPlus} size={16} aria-hidden="true" />
          Add Item
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map(item => (
              <SortableChecklistItem key={item.id} item={item} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default Checklist;
