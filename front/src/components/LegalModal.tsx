import React from 'react';
import useTextFile from '@/hooks/useTextFile';
import { Button, LoadingScreen, Modal } from '@/shared/ui';

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
 * whatever opened the dialog, neither of which a hand-written
 * modal shell does.
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
            className="focus-ring inline-flex cursor-pointer items-center rounded-chip px-2 py-3 text-sm text-ink-secondary underline transition-colors hover:text-ink md:py-2"
          >
            Download
          </a>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {loading && <LoadingScreen label="Loading document..." showLabel fill="inline" />}

      {error && (
        <div role="alert" className="text-sm text-danger-strong">
          Failed to load document.{' '}
          <button type="button" onClick={refetch} className="focus-ring ml-2 cursor-pointer rounded-chip underline">
            Try again
          </button>
        </div>
      )}

      {/* whitespace-pre-wrap preserves the line breaks of the source .txt */}
      {!loading && !error && data && (
        <div className="text-sm whitespace-pre-wrap leading-relaxed text-ink-body">{data}</div>
      )}
    </Modal>
  );
};

export default LegalModal;
