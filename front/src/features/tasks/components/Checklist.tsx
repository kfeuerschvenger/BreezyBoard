import React, { useState } from 'react';
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import { Icon, ProgressBar } from '@/shared/ui';
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
  /** One based, so the row's text field has a name that tells it from the others. */
  position: number;
  onUpdate: (id: string, field: 'text' | 'completed', value: string | boolean) => void;
  onDelete: (id: string) => void;
}

const newItemId = (): string => (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString());

/** A square control box: 44 pixels on a phone, where it is touched, and 28 where a pointer is precise. */
const TARGET = 'flex h-11 w-11 shrink-0 items-center justify-center md:h-7 md:w-7';

const TEXT_INPUT =
  'min-w-0 flex-1 rounded-control border-[1.5px] border-line-control bg-surface px-3 py-2 text-sm text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-ink-tertiary focus:border-focus focus:shadow-focus focus:outline-none';

const SortableChecklistItem: React.FC<SortableChecklistItemProps> = ({ item, position, onUpdate, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-control p-1 ${isDragging ? 'bg-sky-tint' : 'bg-surface'}`}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label="Reorder checklist item"
        className={`${TARGET} focus-ring cursor-grab rounded text-ink-tertiary active:cursor-grabbing`}
      >
        <Icon as={IconGripVertical} size={14} aria-hidden="true" />
      </div>
      <label className={`${TARGET} cursor-pointer`}>
        {/* The browser's own checkbox, tinted with the done colour: it keeps
            the operating system's boundary contrast and its keyboard
            behaviour, which a drawn square would have to rebuild. */}
        <input
          type="checkbox"
          checked={item.completed}
          onChange={event => onUpdate(item.id, 'completed', event.target.checked)}
          aria-label="Completed"
          className="focus-ring size-5 cursor-pointer accent-green-deep"
        />
      </label>
      <input
        type="text"
        value={item.text}
        onChange={event => onUpdate(item.id, 'text', event.target.value)}
        aria-label={`Checklist item ${position}`}
        // An item emptied and left is removed, so editing cannot leave the
        // blank row that adding never creates.
        onBlur={event => {
          if (!event.target.value.trim()) onDelete(item.id);
        }}
        className={`${TEXT_INPUT} ${item.completed ? 'text-ink-secondary line-through' : 'text-ink'}`}
        placeholder="Enter checklist item"
      />
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className={`${TARGET} focus-ring cursor-pointer rounded text-danger hover:bg-danger-bg`}
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

  // What has been typed in the field at the foot and not yet added. It is the
  // field's own and never part of the list, so a list never holds a row that
  // has no text.
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;

    onChange([...items, { id: newItemId(), text, completed: false }]);
    setDraft('');
  };

  // Enter adds the item and does not submit the form the checklist sits in,
  // which is what an Enter in any other text field of it would do. A key that
  // confirms an input method's composition is not an Enter of ours.
  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;

    event.preventDefault();
    handleAdd();
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

  const done = items.filter(item => item.completed).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        {/* A heading rather than a label: it names a section, not a control,
            which is what made it one of the six orphan labels the gate was
            holding. h3 because the dialog's own title is the level above. */}
        <h3 className="font-heading text-[13px] font-semibold text-ink-secondary">
          Checklist
          {items.length > 0 && (
            <span className="ml-2 font-mono text-xs font-normal text-ink-secondary">
              {done}/{items.length}
            </span>
          )}
        </h3>
      </div>

      {items.length > 0 && (
        <ProgressBar
          value={done}
          max={items.length}
          label="Checklist progress"
          valueText={`${done} of ${items.length} done`}
          variant="gradient"
          hue="sky"
          toHue="green"
          className="mb-3"
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((item, index) => (
              <SortableChecklistItem
                key={item.id}
                item={item}
                position={index + 1}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className={`flex items-center gap-1 p-1 ${items.length > 0 ? 'mt-1' : ''}`}>
        <span className={`${TARGET} text-ink-tertiary`}>
          <Icon as={IconPlus} size={16} aria-hidden="true" />
        </span>
        <input
          type="text"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          aria-label="Add an item"
          placeholder="Add an item, press Enter"
          className={`${TEXT_INPUT} h-11 md:h-auto`}
        />
      </div>
    </div>
  );
};

export default Checklist;
