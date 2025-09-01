import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check } from 'lucide-react';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  autoCloseMs?: number; // milliseconds, 0 = don't auto close
  onClose: () => void;
};

/**
 * SuccessModal
 * - Small, reusable success modal with auto-close support.
 * - Accessible: focuses close button when opened, closes on Esc and backdrop click.
 */
const backdrop = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const panel = { hidden: { opacity: 0, scale: 0.98, y: 6 }, visible: { opacity: 1, scale: 1, y: 0 } };

const SuccessModal: React.FC<Props> = ({
  open,
  title = 'Success',
  message = 'Changes saved.',
  autoCloseMs = 2000,
  onClose,
}) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // focus the close button for keyboard users after a short tick
    const t = setTimeout(() => closeRef.current?.focus(), 60);

    // Esc-to-close
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Auto close
  useEffect(() => {
    if (!open || !autoCloseMs) return;
    const timer = setTimeout(() => onClose(), autoCloseMs);
    return () => clearTimeout(timer);
  }, [open, autoCloseMs, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-modal-title"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={panel}
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-green-50 rounded-full">
                  <Check className="text-green-600" size={20} />
                </div>
                <div>
                  <h3 id="success-modal-title" className="text-lg font-semibold text-gray-900">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{message}</p>
                </div>
              </div>

              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SuccessModal;
