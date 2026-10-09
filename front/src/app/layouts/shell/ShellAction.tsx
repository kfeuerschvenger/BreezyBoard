import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from './shellContext';

/**
 * The view's main action, drawn in the shell's header.
 *
 * The action belongs to the view, because only the view knows what it does and
 * holds the state it acts on, and it belongs in the header, because that is
 * where a person looks for it on every screen. A portal reconciles the two:
 * the element is rendered by the view, so its handlers close over the view's
 * state and its tests need nothing from the shell, and it is placed in the
 * header's slot.
 *
 * With no shell around the view the action stays where it was written, so a
 * page rendered on its own still shows it.
 */
export const ShellAction = ({ children }: { children: ReactNode }) => {
  const shell = useShell();

  if (!shell) return <>{children}</>;
  if (!shell.headerSlot) return null;

  return createPortal(children, shell.headerSlot);
};

export default ShellAction;
