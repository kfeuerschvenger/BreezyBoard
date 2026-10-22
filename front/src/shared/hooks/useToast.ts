import { useContext } from 'react';
import { ToastContext } from '../ui/toastContext';

/** Shows and dismisses toasts. Must be used under a `ToastProvider`. */
export const useToast = () => {
  const context = useContext(ToastContext);

  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
};

export default useToast;
