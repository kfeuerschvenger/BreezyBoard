import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useTextFile from '@/hooks/useTextFile';
import { X } from 'lucide-react';

type LegalModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  filePath: string; // Path relative to public, e.g. "/terms-of-service.txt"
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 12 },
};

/**
 * LegalModal
 * - Fetches a plain text file with useTextFile hook.
 * - Shows loading / error states.
 * - Accessible: aria attributes, Esc-to-close, focuses close button on open.
 */
const LegalModal: React.FC<LegalModalProps> = ({ open, onClose, title, filePath }) => {
  const { data, loading, error, refetch } = useTextFile(filePath, open);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the close button when modal opens for accessibility
  useEffect(() => {
    if (open) {
      // small timeout to wait for DOM to render
      const t = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" aria-hidden={!open}>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black bg-opacity-50"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal container */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
            className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 id="legal-modal-title" className="text-xl font-semibold text-gray-900">
                {title}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  aria-label="Close modal"
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X size={18} className="text-gray-600" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {loading && <div className="text-sm text-gray-600">Loading…</div>}

              {error && (
                <div className="text-sm text-red-600">
                  Failed to load document.{' '}
                  <button onClick={refetch} className="underline ml-2 cursor-pointer">
                    Try again
                  </button>
                </div>
              )}

              {!loading && !error && data && (
                // preserve line breaks and spacing from .txt file
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{data}</div>
              )}
            </div>

            {/* Footer: optional download link */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
              <a
                href={encodeURI(filePath)}
                download
                className="text-sm text-gray-600 hover:text-gray-800 underline cursor-pointer"
              >
                Download
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LegalModal;
