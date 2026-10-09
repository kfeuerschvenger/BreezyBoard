import { createContext, useContext } from 'react';

export interface ShellContextValue {
  /**
   * The box in the header that holds the view's main action. It is `null`
   * until the header has mounted, and a view that fills it renders nothing
   * until then.
   */
  headerSlot: HTMLElement | null;
  /** Opens the create board dialog, which the shell hosts for every view. */
  openCreateBoard: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * What the application shell offers the view inside it, or `null` when the
 * view is rendered with no shell around it. A view must keep working in that
 * case: it is how a page is rendered on its own.
 */
export const useShell = (): ShellContextValue | null => useContext(ShellContext);
