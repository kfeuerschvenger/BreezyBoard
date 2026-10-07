import type { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import Footer from '@/components/Footer';

/**
 * The frame every page sits in.
 *
 * The board is the one page that is exactly as tall as the screen: its columns
 * scroll inside themselves, so a frame that grew with its content would give
 * the document a second vertical scrollbar beside the columns'. On that route
 * the frame is pinned to the viewport and carries no footer, so the board
 * takes the whole height under its header. Every other page keeps the footer.
 */
export const AppShell = ({ children }: { children: ReactNode }) => {
  const onBoard = useMatch('/board/:boardId') !== null;

  return (
    <div className={`flex flex-col bg-gray-50 ${onBoard ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
      {children}
      {!onBoard && <Footer />}
    </div>
  );
};

export default AppShell;
