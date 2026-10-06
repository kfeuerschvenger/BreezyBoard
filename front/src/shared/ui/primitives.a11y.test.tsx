import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import {
  Avatar,
  Button,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingScreen,
  PasswordInput,
  Modal,
  StatTile,
  SwatchPicker,
  Textarea,
} from './index';
import type { SwatchOption } from './index';

/**
 * The component layer of the accessibility gate in section 10.2 of the
 * revival plan.
 *
 * These primitives are where accessibility is actually won: one Modal with a
 * labelled dialog role, a focus trap and focus restoration fixes five
 * surfaces at once and makes the sixth impossible to get wrong. A gate that
 * only checks the pages would let the primitive rot and catch it five times
 * over instead of once.
 *
 * Definition of done for a component from here on, per the plan: zero axe
 * violations, operable by keyboard alone, correct role and accessible name.
 * The axe pass covers the first, the assertions around it cover the rest,
 * because axe cannot see focus order or whether escape does anything.
 */

// jsdom has no layout, so every colour-contrast check resolves against
// nothing and reports as incomplete rather than passing. Contrast is checked
// in the end to end layer, against a real rendered page, where it can
// actually be measured.
const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

const noViolations = async (container: HTMLElement) => expect(await axe(container, axeOptions)).toHaveNoViolations();

describe('Button', () => {
  it('has no violations in any variant, including disabled and loading', async () => {
    const { container } = render(
      <div>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Disabled</Button>
        <Button isLoading>Saving</Button>
      </div>
    );

    await noViolations(container);
  });

  it('is reachable and operable by keyboard alone', async () => {
    const user = userEvent.setup();
    let pressed = 0;

    render(<Button onClick={() => (pressed += 1)}>Save changes</Button>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(pressed).toBe(1);
  });
});

describe('IconButton', () => {
  it('carries an accessible name, because an icon alone is not one', async () => {
    const { container } = render(<IconButton aria-label="Close">x</IconButton>);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await noViolations(container);
  });
});

describe('Field', () => {
  it('associates its label with the control it renders', async () => {
    const { container } = render(
      <Field label="Board name" required>
        {props => <Input {...props} />}
      </Field>
    );

    // getByLabelText only finds it if the association is real, which is the
    // whole reason Field takes its control as a function rather than as
    // children: it cannot render a label without wiring one up.
    expect(screen.getByLabelText(/Board name/)).toBeInTheDocument();
    await noViolations(container);
  });

  it('announces its error rather than only colouring the border', async () => {
    const { container } = render(
      <Field label="Email" error="That address is not valid">
        {props => <Input {...props} />}
      </Field>
    );

    const control = screen.getByLabelText('Email');

    expect(control).toHaveAccessibleDescription('That address is not valid');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    await noViolations(container);
  });

  it('associates a hint the same way when there is no error', async () => {
    render(
      <Field label="Password" hint="At least eight characters">
        {props => <Input {...props} />}
      </Field>
    );

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least eight characters');
  });

  it('works for a textarea too, not only an input', async () => {
    const { container } = render(
      <Field label="Description">{props => <Textarea {...props} />}</Field>
    );

    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
    await noViolations(container);
  });
});

describe('Modal', () => {
  const open = (props: Partial<React.ComponentProps<typeof Modal>> = {}) =>
    render(
      <Modal open onClose={() => {}} title="Create board" {...props}>
        <Field label="Board name">{fieldProps => <Input {...fieldProps} />}</Field>
      </Modal>
    );

  it('is a dialog with an accessible name and no violations', async () => {
    open();

    const dialog = screen.getByRole('dialog');

    // CreateBoardModal has no dialog role at all, per P4-3. The point of a
    // primitive is that this cannot be got wrong once.
    expect(dialog).toHaveAccessibleName('Create board');
    await noViolations(document.body);
  });

  it('closes on escape', async () => {
    const user = userEvent.setup();
    let closed = 0;

    open({ onClose: () => (closed += 1) });
    await user.keyboard('{Escape}');

    expect(closed).toBe(1);
  });

  it('keeps tab inside the dialog rather than letting it wander behind', async () => {
    const user = userEvent.setup();

    render(
      <>
        <button type="button">Behind the modal</button>
        <Modal open onClose={() => {}} title="Create board" footer={<Button>Create</Button>}>
          <Field label="Board name">{fieldProps => <Input {...fieldProps} />}</Field>
        </Modal>
      </>
    );

    const dialog = screen.getByRole('dialog');

    for (let press = 0; press < 6; press += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('renders nothing at all when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Create board">
        <p>Body</p>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Drawer', () => {
  it('is a labelled dialog with no violations', async () => {
    render(
      <Drawer open onClose={() => {}} title="Edit task">
        <Field label="Title">{props => <Input {...props} />}</Field>
      </Drawer>
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit task');
    await noViolations(document.body);
  });

  it('closes on escape', async () => {
    const user = userEvent.setup();
    let closed = 0;

    render(
      <Drawer open onClose={() => (closed += 1)} title="Edit task">
        <p>Body</p>
      </Drawer>
    );

    await user.keyboard('{Escape}');

    expect(closed).toBe(1);
  });
});

const SWATCHES: SwatchOption[] = [
  { id: 'blue', label: 'Royal Blue', color: '#0052CC' },
  { id: 'green', label: 'Emerald', color: '#2F9E44' },
];

describe('SwatchPicker', () => {
  it.each(['inline', 'grid'] as const)('is a named group of named radios in the %s layout', async layout => {
    const { container } = render(
      <SwatchPicker name="color" legend="Board colour" options={SWATCHES} value="blue" onChange={() => {}} layout={layout} />
    );

    expect(screen.getByRole('group', { name: 'Board colour' })).toBeInTheDocument();
    // A block of colour has no name of its own, so an unnamed swatch is
    // announced as "radio" with nothing to tell it from the one beside it.
    expect(screen.getByRole('radio', { name: 'Royal Blue' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Emerald' })).not.toBeChecked();
    await noViolations(container);
  });

  it('is operable with the arrow keys alone, which is what the radio group buys', async () => {
    const user = userEvent.setup();
    const chosen: string[] = [];

    render(
      <SwatchPicker name="color" legend="Board colour" options={SWATCHES} value="blue" onChange={id => chosen.push(id)} />
    );

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(chosen).toEqual(['green']);
  });

  it('describes the group by its error rather than leaving it on screen unlinked', async () => {
    const { container } = render(
      <SwatchPicker
        name="color"
        legend="Board colour"
        options={SWATCHES}
        value=""
        onChange={() => {}}
        error="Color is required"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Color is required');
    expect(screen.getByRole('radio', { name: 'Royal Blue' })).toHaveAccessibleDescription('Color is required');
    await noViolations(container);
  });

  // A live region announces its contents; it does not take a name from them.
  // Asserting on the name here passes only if the component carries a label it
  // does not need, so the assertion is on what would actually be read out.
  it('announces the wait instead of showing a spinner that says nothing', async () => {
    const { container } = render(
      <SwatchPicker name="color" legend="Board colour" options={[]} value="" onChange={() => {}} isLoading />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading colours');
    await noViolations(container);
  });
});

describe('StatTile', () => {
  it('reads as the figure and the word for what it counts, in every tone', async () => {
    const { container } = render(
      <div>
        <StatTile icon={<span>folder</span>} tone="blue" value={7} label="Total Boards" />
        <StatTile icon={<span>people</span>} tone="green" value={12} label="Team Members" />
        <StatTile icon={<span>calendar</span>} tone="orange" value={34} label="Total Tasks" />
        <StatTile icon={<span>ring</span>} tone="purple" value="58%" label="Avg Progress" />
      </div>
    );

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Total Boards')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    await noViolations(container);
  });

  // The icon repeats what the label says. Left exposed it is announced a
  // second time, under whatever name assistive technology can guess.
  it('hides its icon from assistive technology', () => {
    render(<StatTile icon={<span>folder</span>} tone="blue" value={7} label="Total Boards" />);

    expect(screen.getByText('folder').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  // The tone picks a whole class name out of a map rather than building one,
  // which is the P4-6 failure: a composed class is not in the stylesheet at
  // all, and the tile renders unstyled while every assertion above passes.
  it('applies the whole background class its tone names', () => {
    render(<StatTile icon={<span>folder</span>} tone="orange" value={34} label="Total Tasks" />);

    expect(screen.getByText('folder').parentElement).toHaveClass('bg-orange-100');
  });
});

describe('EmptyState', () => {
  // The title is a heading rather than styled text, because this replaces the
  // content of a region and someone navigating by headings has to be able to
  // reach the explanation of why there is none.
  it('announces its title as a heading, with the action reachable', async () => {
    const user = userEvent.setup();
    let pressed = 0;

    const { container } = render(
      <EmptyState
        icon={<span>folder</span>}
        title="No boards yet"
        description="Create your first board to get started"
        action={<button onClick={() => (pressed += 1)}>Create Your First Board</button>}
      />
    );

    expect(screen.getByRole('heading', { name: 'No boards yet' })).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Create Your First Board' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(pressed).toBe(1);

    await noViolations(container);
  });

  it('hides its icon from assistive technology', () => {
    render(<EmptyState icon={<span>folder</span>} title="No boards yet" />);

    expect(screen.getByText('folder').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders without a description or an action', async () => {
    const { container } = render(<EmptyState icon={<span>folder</span>} title="Nothing here" />);

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await noViolations(container);
  });
});

describe('LoadingScreen', () => {
  // A rotating border says nothing. The role and the name are what make a
  // page with no content yet distinguishable from a page with none at all.
  it('announces what is being waited for', async () => {
    const { container } = render(<LoadingScreen label="Loading boards" />);

    expect(screen.getByRole('status', { name: 'Loading boards' })).toBeInTheDocument();
    await noViolations(container);
  });

  it('keeps the name when the label is also drawn as text', async () => {
    const { container } = render(<LoadingScreen label="Loading boards" showLabel />);

    expect(screen.getByRole('status', { name: 'Loading boards' })).toBeInTheDocument();
    expect(screen.getByText('Loading boards')).toBeInTheDocument();
    await noViolations(container);
  });

  it('still announces itself when no label was given', () => {
    render(<LoadingScreen />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});

describe('PasswordInput', () => {
  it('hides the value until the toggle is pressed, and says which state it is in', async () => {
    const user = userEvent.setup();
    const { container } = render(<PasswordInput aria-label="Password" />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    // The name states what pressing it will do next, which is what makes two
    // presses distinguishable without looking at the field.
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');

    await noViolations(container);
  });

  // Two password fields on one form both offering "Show password" names
  // neither of them, which is the register page exactly.
  it('takes a name for its toggle, so two fields on one form are distinguishable', () => {
    render(
      <div>
        <PasswordInput aria-label="Password" toggleLabel="password" />
        <PasswordInput aria-label="Confirm password" toggleLabel="confirm password" />
      </div>
    );

    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show confirm password' })).toBeInTheDocument();
  });

  // The toggle has to be inside a positioned wrapper. Two of the three
  // hand-written copies this replaces were not, so they rendered against an
  // ancestor further up the page. Asserted as a class, because the layout it
  // produces exists only in a browser. Finding P4-13.
  it('keeps the toggle inside a positioned wrapper', () => {
    render(<PasswordInput aria-label="Password" />);

    expect(screen.getByRole('button', { name: 'Show password' }).parentElement).toHaveClass('relative');
  });

  it('is reachable by keyboard without leaving the field', async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" />);

    await user.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
  });
});

describe('Avatar', () => {
  it('names itself after the person when it stands alone', async () => {
    const { container } = render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
    await noViolations(container);
  });

  // Hidden rather than named, for the common case: a row or a chip with the
  // person's name written right next to the picture. Every hand-written copy
  // this replaced announced the name twice.
  it('says nothing when the name is already beside it', async () => {
    const { container } = render(
      <div>
        <Avatar name="Ada Lovelace" decorative />
        <span>Ada Lovelace</span>
      </div>
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await noViolations(container);
  });

  it('shows the picture instead of the initials when there is one', () => {
    const { container } = render(<Avatar name="Ada Lovelace" src="/uploads/ada.png" />);

    expect(container.querySelector('img')).toHaveAttribute('src', '/uploads/ada.png');
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  // The image carries no alt of its own: the wrapper is either named or
  // hidden, and an alt as well would announce the person twice inside one
  // element or leak out of a hidden one.
  it('leaves the naming to the wrapper rather than to the image', () => {
    const { container } = render(<Avatar name="Ada Lovelace" src="/uploads/ada.png" />);

    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it.each([
    ['Ada Lovelace', 'AL'],
    ['Ada', 'A'],
    ['Ada Byron King Lovelace', 'AL'],
    ['  ada   lovelace  ', 'AL'],
  ])('takes the initials of %s as %s', (name, expected) => {
    render(<Avatar name={name} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('falls back to a question mark rather than an empty circle', () => {
    render(<Avatar name="   " />);

    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Unknown user' })).toBeInTheDocument();
  });
});
