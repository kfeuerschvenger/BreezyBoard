import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { IconArrowDown, IconArrowUp, IconPlaneArrival, IconPlus, IconTrash } from '@tabler/icons-react';
import type { Color } from '@/models';
import { Button, Field, Icon, IconButton, Input, Select, SwatchPicker } from '@/shared/ui';
import { MAX_COLUMNS, MIN_COLUMNS, columnNameProblem, columnPositions, nextColumnHue } from '../boardColumns';
import { boardHueOptions } from '../boardHue';
import type { EditBoardValues } from '../boardForm';

export interface ColumnsEditorProps {
  /** The board palette, which a column is painted from as a board is. */
  colors: Color[];
  /** Live cards in each column, by column id. A column with any cannot be removed. */
  taskCounts: Readonly<Record<string, number>>;
  /** Puts the cursor in the name of the column to add, as "Add column" in the header asks for. */
  focusAdd?: boolean;
}

type MoveDirection = 'up' | 'down';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const ERROR_CLASSES = 'mt-1.5 text-[13px] font-medium text-danger-strong';

/**
 * The columns section of the edit board dialog.
 *
 * It edits the form's `columns` list and changes nothing on its own: every add,
 * rename, recolour, reorder and removal stays in the form until Save sends the
 * whole list in one request, and Cancel throws it all away.
 *
 * Reordering is by the move up and move down button on each row, not by
 * dragging, so it works from the keyboard and a screen reader. The server
 * treats the highest position as where work lands, which is why the last row
 * says so and why a column moved into last place changes which cards count as
 * complete.
 *
 * A column that holds live cards has its removal blocked and says why on the
 * row. A blocked control is marked `aria-disabled` and not `disabled`, so it can
 * still be reached and its reason is read out from `aria-describedby`. The count is what the board page held when the dialog opened, and the
 * server checks again on Save.
 */
export const ColumnsEditor = ({ colors, taskCounts, focusAdd = false }: ColumnsEditorProps) => {
  const headingId = useId();
  const groupId = useId();
  const { control, register, formState } = useFormContext<EditBoardValues>();
  const { fields, insert, remove, move } = useFieldArray({ control, name: 'columns' });
  const rows = useWatch({ control, name: 'columns' }) ?? [];
  const options = boardHueOptions(colors);
  const errors = formState.errors.columns;

  const [name, setName] = useState('');
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [position, setPosition] = useState<{ index: number; rowsKey: string } | null>(null);
  const [colorChoice, setColorChoice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [moved, setMoved] = useState<{ key: string; direction: MoveDirection } | null>(null);
  const [removedOne, setRemovedOne] = useState(false);
  const [addedAt, setAddedAt] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const container = useRef<HTMLElement | null>(null);

  const atMost = rows.length >= MAX_COLUMNS;
  // New columns go before the last one unless the person says otherwise, so the
  // column where work lands stays last.
  const defaultPosition = Math.max(rows.length - 1, 0);
  // A chosen slot is "between X and Y", which means another slot as soon as a
  // row is moved, removed, added or reloaded. It is remembered with the rows it
  // was chosen among and counts only while they are the rows on screen.
  const rowsKey = fields.map(field => field.id).join('|');
  const chosenIndex = position?.rowsKey === rowsKey ? position.index : null;
  const chosenPosition = Math.min(chosenIndex ?? defaultPosition, rows.length);
  const defaultColor = options.find(option => option.hue === nextColumnHue(rows.length))?.id ?? options[0]?.id ?? '';
  const chosenColor = colorChoice ?? defaultColor;

  // The trap that opens a dialog puts focus on its first control after this
  // section has mounted, so asking for focus takes a frame.
  useEffect(() => {
    if (!focusAdd) return;
    const frame = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusAdd]);

  // A moved row is the same element in a new place and the browser may drop its
  // focus on the way, so focus is put back on the button that was pressed, or on
  // its opposite when the row has reached the end and that button is now off.
  useEffect(() => {
    if (!moved) return;

    const row = container.current?.querySelector<HTMLElement>(`[data-row-key="${moved.key}"]`);
    const wanted = row?.querySelector<HTMLButtonElement>(`[data-move="${moved.direction}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-move="${moved.direction === 'up' ? 'down' : 'up'}"]`);
    (wanted && wanted.getAttribute('aria-disabled') !== 'true' ? wanted : other)?.focus();
    setMoved(null);
  }, [moved]);

  // When adding reaches the most a board has, the field that adds a column is
  // switched off, and focus would fall to the page. It goes to the name of the
  // new row instead, which is always there.
  useEffect(() => {
    if (addedAt === null) return;
    container.current?.querySelectorAll('li')[addedAt]?.querySelector<HTMLInputElement>('input')?.focus();
    setAddedAt(null);
  }, [addedAt]);

  // A removed row takes the focused button with it, so focus goes to the field
  // that adds a column, which is always there.
  useEffect(() => {
    if (!removedOne) return;
    nameRef.current?.focus();
    setRemovedOne(false);
  }, [removedOne]);

  const titleOf = (index: number) => rows[index]?.title?.trim() || `column ${index + 1}`;

  const shift = (index: number, direction: MoveDirection) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;

    const title = titleOf(index);
    move(index, target);
    setMoved({ key: fields[index].id, direction });
    setAnnouncement(`Moved ${title} ${direction}, now column ${target + 1} of ${fields.length}.`);
  };

  const take = (index: number) => {
    const title = titleOf(index);
    remove(index);
    setRemovedOne(true);
    setAnnouncement(`Removed ${title}. ${plural(fields.length - 1, 'column', 'columns')} left.`);
  };

  const add = () => {
    if (atMost) return;

    const problem = columnNameProblem(
      name,
      rows.map(row => row.title)
    );
    if (problem) {
      setNameProblem(problem);
      nameRef.current?.focus();
      return;
    }

    const title = name.trim();
    // The form would focus the new row's name; the cursor stays in the field
    // that adds a column, so the next one can be typed straight away.
    insert(chosenPosition, { title, color: chosenColor }, { shouldFocus: false });
    setAnnouncement(`Added ${title} as column ${chosenPosition + 1} of ${fields.length + 1}.`);
    setName('');
    setNameProblem(null);
    setPosition(null);
    setColorChoice(null);

    if (fields.length + 1 >= MAX_COLUMNS) {
      setAddedAt(chosenPosition);
    } else {
      nameRef.current?.focus();
    }
  };

  // Enter in the name of a new column adds it. Left alone it would submit the
  // dialog's form and save every other change with it.
  const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };

  return (
    <section ref={container} aria-labelledby={headingId} className="space-y-4">
      <div>
        <h3 id={headingId} className="font-heading text-[17px] font-bold text-ink">
          Columns
        </h3>
        <p className="mt-1 text-[13px] text-ink-secondary">
          Changes here are saved with the rest of the board. A column can be removed once it has no cards, and a board
          keeps between {MIN_COLUMNS} and {MAX_COLUMNS} columns. Use the arrows to change the order.
        </p>
      </div>

      <ul className="space-y-3">
        {fields.map((field, index) => {
          const title = titleOf(index);
          const live = field.columnId ? (taskCounts[field.columnId] ?? 0) : 0;
          const last = index === fields.length - 1;
          const rowError = errors?.[index]?.title?.message;
          const blocked =
            fields.length <= MIN_COLUMNS
              ? `A board keeps at least ${MIN_COLUMNS} columns.`
              : live > 0
                ? `${title} has ${plural(live, 'card', 'cards')}. Move ${live === 1 ? 'it' : 'them'} to another column to remove this column.`
                : null;
          const blockedId = `${groupId}-blocked-${field.id}`;
          const errorId = `${groupId}-error-${field.id}`;

          return (
            <li
              key={field.id}
              data-row-key={field.id}
              className="rounded-control border border-line-08 bg-surface-subtle p-3"
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-48 flex-1">
                  <Input
                    {...register(`columns.${index}.title`)}
                    aria-label={`Name of column ${index + 1}`}
                    aria-invalid={Boolean(rowError)}
                    aria-describedby={rowError ? errorId : undefined}
                    hasError={Boolean(rowError)}
                    className="h-10"
                  />
                  {rowError && (
                    <p id={errorId} role="alert" className={ERROR_CLASSES}>
                      {rowError}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    type="button"
                    data-move="up"
                    aria-label={`Move ${title} up`}
                    aria-disabled={index === 0 || undefined}
                    onClick={() => shift(index, 'up')}
                  >
                    <Icon as={IconArrowUp} size={18} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    type="button"
                    data-move="down"
                    aria-label={`Move ${title} down`}
                    aria-disabled={last || undefined}
                    onClick={() => shift(index, 'down')}
                  >
                    <Icon as={IconArrowDown} size={18} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    type="button"
                    aria-label={`Remove ${title}`}
                    aria-describedby={blocked ? blockedId : undefined}
                    aria-disabled={blocked ? true : undefined}
                    onClick={() => {
                      if (!blocked) take(index);
                    }}
                  >
                    <Icon as={IconTrash} size={18} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>

              <div className="mt-2">
                <Controller
                  control={control}
                  name={`columns.${index}.color`}
                  render={({ field: color }) => (
                    <SwatchPicker
                      name={`${groupId}-color-${field.id}`}
                      legend={<span className="sr-only">Colour of {title}</span>}
                      options={options}
                      value={color.value}
                      onChange={color.onChange}
                    />
                  )}
                />
              </div>

              {blocked && (
                <p id={blockedId} className="mt-2 text-[13px] text-ink-secondary">
                  {blocked}
                </p>
              )}

              {last && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-secondary">
                  <Icon as={IconPlaneArrival} size={16} className="shrink-0 text-green-deep" aria-hidden="true" />
                  Cards in this column count as landed.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div role="status" className="sr-only">
        {announcement}
      </div>

      <div role="group" aria-labelledby={`${groupId}-add`} className="space-y-4 rounded-control border border-dashed border-line-control p-3">
        <h4 id={`${groupId}-add`} className="text-[14px] font-semibold text-ink">
          Add a column
        </h4>

        <Field label="New column name" error={nameProblem ?? undefined}>
          {props => (
            <Input
              {...props}
              ref={nameRef}
              value={name}
              placeholder="For example, In review"
              disabled={atMost}
              hasError={Boolean(nameProblem)}
              onChange={event => {
                setName(event.target.value);
                setNameProblem(null);
              }}
              onKeyDown={onNameKeyDown}
            />
          )}
        </Field>

        <Field label="Position">
          {props => (
            <Select
              {...props}
              value={chosenPosition}
              disabled={atMost}
              onChange={event => setPosition({ index: Number(event.target.value), rowsKey })}
            >
              {columnPositions(rows.map(row => row.title)).map(option => (
                <option key={option.index} value={option.index}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <SwatchPicker
          name={`${groupId}-new-color`}
          legend="Colour"
          options={options}
          value={chosenColor}
          onChange={setColorChoice}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={atMost}
            onClick={add}
            leftIcon={<Icon as={IconPlus} size={18} aria-hidden="true" />}
          >
            Add column
          </Button>
          {atMost && <p className="text-[13px] text-ink-secondary">A board has at most {MAX_COLUMNS} columns.</p>}
        </div>
      </div>
    </section>
  );
};

export default ColumnsEditor;
