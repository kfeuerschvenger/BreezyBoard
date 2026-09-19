import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { resolveIcon } from '@/shared/lib/lucideIcons';
import { TemplateService, ColorService } from '@/services';
import type { Template, Color } from '@/models';
import { useDraft } from '@/shared/hooks/useDraft';
import { Button, Field, Input, Modal, Textarea } from '@/shared/ui';

const boardSchema = z.object({
  title: z.string().trim().min(1, 'A board needs a name'),
  description: z.string().trim(),
  color: z.string().min(1, 'Choose a colour'),
  template: z.string().min(1, 'Choose a template'),
});

export type BoardFormData = z.infer<typeof boardSchema>;

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreateBoard: (data: BoardFormData) => void;
}

const EMPTY: BoardFormData = { title: '', description: '', color: '', template: '' };

// The legend carries the same weight as a Field's label, so the two groups
// below read as part of the same form rather than as decoration.
const LEGEND_CLASSES = 'block text-sm font-medium text-gray-700 mb-2';

// Selection is expressed with real radio inputs inside labels, hidden from
// sight but not from the accessibility tree. That is what buys keyboard
// operation: arrow keys move within the group, the group is announced as a
// group, and the legend names it, all from the browser and none of it from
// code here. The buttons this replaced were a grid of clickable divs under
// an orphan label, which is two of the ten label-has-associated-control
// warnings the gate was holding.
const OPTION_CLASSES =
  'relative block cursor-pointer rounded-lg border-2 transition-all border-gray-200 hover:border-gray-300 ' +
  'has-[:checked]:border-blue-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500';

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ open, onClose, onCreateBoard }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [boardColors, setBoardColors] = useState<Color[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    formState: { errors, isValid },
  } = useForm<BoardFormData>({
    resolver: zodResolver(boardSchema),
    defaultValues: EMPTY,
    mode: 'onChange',
  });

  // Persists an in-progress "new board" form across a reload or an
  // accidental close. The key stays constant (not gated by `open`) so that
  // draft.clear() below still targets the right storage entry after the
  // modal has already closed; the read/write effects each guard on `open`
  // themselves instead.
  const draft = useDraft<BoardFormData>('board:new');
  const hasRestoredDraftRef = useRef(false);
  // Set when a submit was attempted, so the draft is only cleared once the
  // modal actually closes afterward, not the instant onCreateBoard fires.
  // onCreateBoard has a void/fire-and-forget contract, so this component has
  // no direct success signal; the parent closes the modal on success and
  // leaves it open on failure, so "submitted, then closed" is the closest
  // available proxy for "saved successfully" without changing that contract.
  const didSubmitRef = useRef(false);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (open) {
      hasRestoredDraftRef.current = false;
    }

    const fetchData = async () => {
      try {
        const [templatesData, colorsData] = await Promise.all([
          TemplateService.getAll(),
          ColorService.getByType('board'),
        ]);
        setTemplates(templatesData ?? []);
        setBoardColors(colorsData ?? []);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) fetchData();
  }, [open]);

  // Defaults and restore in one effect rather than two, which is the one
  // real simplification the form library buys here. They used to be
  // separate, racing on the same isLoading transition, with a comment
  // explaining that the restore had to run second or the defaults would
  // silently replace a colour the user had already chosen. Deciding both in
  // one place removes the race instead of documenting it.
  //
  // Anything already in the form wins over both, and that ordering is the
  // whole point rather than a detail. This effect runs when an async fetch
  // resolves, by which time a fast typist is mid-word, and the first version
  // of this migration called reset() with the computed values alone and
  // threw their typing away. That is the same defect as P2-10, where the
  // colour fetch resolving late rebuilt the entire form over whatever was in
  // it. The implementation this replaced merged rather than replaced, which
  // is why it never had the problem.
  useEffect(() => {
    if (!open || isLoading || hasRestoredDraftRef.current) return;

    const typed = getValues();
    const restored = draft.read();
    const firstColor = boardColors[0]?._id ?? boardColors[0]?.value ?? '';
    const firstTemplate = templates[0]?._id ?? templates[0]?.name ?? '';

    reset({
      title: typed.title || restored?.title || '',
      description: typed.description || restored?.description || '',
      color: typed.color || restored?.color || firstColor,
      template: typed.template || restored?.template || firstTemplate,
    });

    hasRestoredDraftRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, boardColors, templates, draft.read, getValues, reset]);

  // Autosave while open. Gated on hasRestoredDraftRef so it never persists
  // the still-empty form before the effect above has had its turn: without
  // that guard this subscription also fires the instant the modal opens,
  // writing an empty snapshot to storage before the async template and
  // colour fetch resolves, and the restore then reads that snapshot back
  // over whatever the user had already typed.
  useEffect(() => {
    if (!open) return;

    const subscription = watch(values => {
      if (!hasRestoredDraftRef.current) return;
      draft.write(values as BoardFormData);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, watch, draft.write]);

  // Clear the draft only once a submit was attempted and the modal has
  // since closed (see didSubmitRef above for why this is the signal used
  // instead of clearing directly in the submit handler).
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (wasOpen && !open && didSubmitRef.current) {
      draft.clear();
      didSubmitRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft.clear]);

  const onSubmit = handleSubmit(values => {
    didSubmitRef.current = true;
    onCreateBoard(values);
    reset({
      ...EMPTY,
      color: boardColors[0]?._id ?? '',
      template: templates[0]?._id ?? '',
    });
  });

  const selectedTemplate = watch('template');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Board"
      subtitle="Set up your project board with custom settings"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-board-form" disabled={!isValid}>
            Create Board
          </Button>
        </div>
      }
    >
      <form id="create-board-form" onSubmit={onSubmit} className="space-y-6">
        <Field label="Board Name" required error={errors.title?.message}>
          {props => <Input {...props} {...register('title')} placeholder="Enter board name" />}
        </Field>

        <Field label="Description" error={errors.description?.message}>
          {props => (
            <Textarea {...props} {...register('description')} rows={3} placeholder="Describe your board's purpose" />
          )}
        </Field>

        <fieldset>
          <legend className={LEGEND_CLASSES}>Board Color</legend>
          <div className="grid grid-cols-4 gap-3">
            {boardColors.map(color => {
              const value = color._id ?? color.value;
              return (
                <label key={value} className={`${OPTION_CLASSES} p-3`}>
                  <input type="radio" value={value} className="sr-only" {...register('color')} />
                  <span className="block w-full h-8 rounded" style={{ backgroundColor: color.value }} />
                  <span className="block text-xs text-gray-600 mt-2 text-center">{color.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LEGEND_CLASSES}>Board Template</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(template => {
              const value = template._id ?? template.name;
              const IconComponent = resolveIcon(template.iconName);
              const isSelected = selectedTemplate === value;

              return (
                <label key={value} className={`${OPTION_CLASSES} p-4 text-left has-[:checked]:bg-blue-50`}>
                  <input type="radio" value={value} className="sr-only" {...register('template')} />
                  <span className="flex items-start gap-3">
                    <span className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <IconComponent
                        size={20}
                        aria-hidden="true"
                        className={isSelected ? 'text-blue-600' : 'text-gray-600'}
                      />
                    </span>
                    <span className="flex-1">
                      {/* h3, not h4. The modal's own title is an h2, and
                          jumping a level is what axe reports as
                          heading-order. */}
                      <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
                      <span className="block text-sm text-gray-600 mb-2">{template.description}</span>
                      <span className="flex flex-wrap gap-1">
                        {template.columns.map((column, index) => (
                          <span key={index} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                            {typeof column === 'string' ? column : column.title}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
};

export default CreateBoardModal;
