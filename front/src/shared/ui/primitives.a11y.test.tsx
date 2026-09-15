import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Button, Drawer, Field, IconButton, Input, Modal, Textarea } from './index';

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
