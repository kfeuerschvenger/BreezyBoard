import { useEffect, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useColors } from '@/features/colors';
import { useTemplates } from '../queries';
import { TemplatePicker } from './TemplatePicker';
import type { Template, Color } from '@/models';
import { useDraft } from '@/shared/hooks/useDraft';
import { Button, Modal } from '@/shared/ui';
import { z } from 'zod';
import { boardFieldsSchema } from '../boardForm';
import { BoardFormFields } from './BoardFormFields';

const boardSchema = boardFieldsSchema.extend({
  template: z.string().min(1, 'Choose a template'),
});

export type BoardFormData = z.infer<typeof boardSchema>;

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreateBoard: (data: BoardFormData) => void;
}

const EMPTY: BoardFormData = { title: '', description: '', color: '', template: '' };

// Stable identities for the two lists while their requests are in flight, so
// the defaults effect below is not re-run by a fresh literal every render.
const NO_COLORS: Color[] = [];
const NO_TEMPLATES: Template[] = [];

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ open, onClose, onCreateBoard }) => {
  // Both lists come from the cache rather than from an effect here. The board
  // palette in particular was being fetched twice on the same screen: the
  // dashboard behind this modal already holds it, and opening the modal asked
  // the server for it again. Measured before the change, one request on load
  // and a second on open.
  //
  // What the failure branch below used to be is worth keeping in mind. It
  // logged and said nothing else, so a failed load left both lists empty, the
  // schema requires both, and the create button was disabled forever with no
  // indication of why. The form looked ordinary and was permanently dead. It
  // surfaced twice as "the submit button never became enabled" and was twice
  // diagnosed as a timing problem.
  const colorsQuery = useColors('board');
  const templatesQuery = useTemplates(open);

  const boardColors = colorsQuery.data ?? NO_COLORS;
  const templates = templatesQuery.data ?? NO_TEMPLATES;
  const isLoading = colorsQuery.isPending || templatesQuery.isPending;
  const loadFailed = colorsQuery.isError || templatesQuery.isError;

  const form = useForm<BoardFormData>({
    resolver: zodResolver(boardSchema),
    defaultValues: EMPTY,
    mode: 'onChange',
  });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { isValid },
  } = form;

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
    if (open) hasRestoredDraftRef.current = false;
  }, [open]);

  // Defaults and restore in one effect rather than two, which is the one
  // real simplification the form library buys here. They used to be
  // separate, racing on the same isLoading transition, with a comment
  // explaining that the restore had to run second or the defaults would
  // silently replace a colour the user had already chosen. Deciding both in
  // one place removes the race instead of documenting it.
  //
  // Anything already in the form wins over both, and that ordering is the
  // whole point rather than a detail. This effect fires when an async fetch
  // resolves, which is exactly when somebody is mid-word, so it is the same
  // hazard as P2-10: state derived from an async value must be merged, never
  // replaced.
  //
  // The merge is written field by field, and only into fields that are still
  // empty, rather than as one reset() carrying the four computed values. The
  // difference is not stylistic. reset() discards the form library's field
  // registry, and a change event arriving between that call and React
  // re-running the register refs finds no field to record against, so it is
  // dropped in silence; the re-registration then writes the stale value back
  // over what was typed, and the field is left holding nothing. Reading the
  // typed values first and rewriting all four does not close that window
  // either, because the value that gets lost is one that arrives after the
  // read. Writing only the empty fields leaves the rest untouched, so a
  // keystroke racing this effect has nothing to collide with.
  useEffect(() => {
    if (!open || isLoading || hasRestoredDraftRef.current) return;

    // Nothing to default from yet, so this effect has not done its job and
    // must not mark itself as having done it. A failed load leaves both lists
    // empty while `isLoading` is false, and marking done there is what makes
    // the retry below land the data and change nothing: the colour and
    // template arrive, the effect refuses to run, and the create button stays
    // disabled with no visible reason.
    //
    // The previous version avoided this by resetting the flag whenever the
    // retry counter changed, which worked and said nothing about why. Saying
    // it here means a retry needs no signal of its own.
    // Both, not either. The schema requires a colour and a template, so
    // until both lists are in hand there is no complete set of defaults to
    // apply, and a partial pass would mark the job done with one field still
    // empty. A load where one request succeeds and the other fails is
    // exactly the case the retry below exists for.
    if (boardColors.length === 0 || templates.length === 0) return;

    const restored = draft.read();
    const firstColor = boardColors[0]?._id ?? boardColors[0]?.value ?? '';
    const firstTemplate = templates[0]?._id ?? templates[0]?.name ?? '';

    const fillIfEmpty = (name: keyof BoardFormData, value: string | undefined) => {
      if (!value || getValues(name)) return;
      setValue(name, value, { shouldValidate: true });
    };

    fillIfEmpty('title', restored?.title);
    fillIfEmpty('description', restored?.description);
    fillIfEmpty('color', restored?.color || firstColor);
    fillIfEmpty('template', restored?.template || firstTemplate);

    hasRestoredDraftRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, boardColors, templates, draft.read, getValues, setValue]);

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
      {loadFailed && (
        <div role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          The colours and templates could not be loaded, so a board cannot be created yet.{' '}
          <button
            type="button"
            onClick={() => {
              void colorsQuery.refetch();
              void templatesQuery.refetch();
            }}
            className="underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      <FormProvider {...form}>
        <form id="create-board-form" onSubmit={onSubmit} className="space-y-6">
          <BoardFormFields colors={boardColors} />

          <TemplatePicker templates={templates} value={selectedTemplate} registration={register('template')} />
        </form>
      </FormProvider>
    </Modal>
  );
};

export default CreateBoardModal;
