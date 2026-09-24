import React from 'react';
import useTextFile from '@/hooks/useTextFile';
import { Button, Modal } from '@/shared/ui';

type LegalModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  filePath: string; // Path relative to public, e.g. "/terms-of-service.txt"
};

/**
 * LegalModal
 * Fetches a plain text document and shows it, with loading and error states.
 *
 * Everything that used to be here about backdrops, panels, animation
 * variants, the escape listener and focusing the close button is gone: it
 * lives in the shared Modal, which also traps focus and restores it to
 * whatever opened the dialog, neither of which this copy did. That is
 * finding P3-4, the modal shell reimplemented four times.
 */
const LegalModal: React.FC<LegalModalProps> = ({ open, onClose, title, filePath }) => {
  const { data, loading, error, refetch } = useTextFile(filePath, open);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <a
            href={encodeURI(filePath)}
            download
            className="text-sm text-gray-600 hover:text-gray-800 underline cursor-pointer"
          >
            Download
          </a>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {loading && <p className="text-sm text-gray-600">Loading...</p>}

      {error && (
        <div role="alert" className="text-sm text-red-600">
          Failed to load document.{' '}
          <button type="button" onClick={refetch} className="underline ml-2 cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* whitespace-pre-wrap preserves the line breaks of the source .txt */}
      {!loading && !error && data && (
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{data}</div>
      )}
    </Modal>
  );
};

export default LegalModal;
