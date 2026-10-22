import { createContext } from 'react';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  message: string;
  /** One follow-up the person can take, such as Undo. */
  action?: ToastAction;
  /** How long it stays when nothing is hovering or focusing it, in milliseconds. */
  duration?: number;
}

export interface ToastContextValue {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);
