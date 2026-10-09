import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { IconMenu2 } from '@tabler/icons-react';
import { useEscapeKey } from '@/shared/hooks/useEscapeKey';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Icon, IconButton } from '@/shared/ui';
import { CreateBoardDialog } from './shell/CreateBoardDialog';
import { ShellContext } from './shell/shellContext';
import { ShellHeader } from './shell/ShellHeader';
import { Sidebar } from './shell/Sidebar';

/** From this width up the sidebar is a column of the page; below it, a panel. */
const LARGE = '(min-width: 1024px)';

const SIDEBAR_ID = 'app-sidebar';

/**
 * The frame every signed in page sits in: the gradient ground, the glass
 * sidebar, a 56 pixel header, and a content area that scrolls on its own.
 *
 * The frame is exactly as tall as the screen on every page, so the document
 * never scrolls and the sidebar never moves. The board is the one page whose
 * content scrolls inside itself: its columns scroll, so on that route the
 * content area clips instead of scrolling, and the board takes the whole
 * height under its header with no second vertical scrollbar beside the
 * columns'. Every other page scrolls in the content area.
 *
 * Below the large breakpoint the sidebar is an off-canvas panel opened from a
 * button in the header. While it is open it behaves as a dialog: focus is held
 * inside it, the rest of the page is inert, Escape and a press on the scrim
 * close it, and focus goes back to the button that opened it. Choosing a
 * destination closes it too, because the panel has done its job and would
 * otherwise sit over the page that was just asked for. While it is closed it
 * is invisible and inert, so its links are neither seen nor tabbed to.
 *
 * The create board dialog is hosted here, because the sidebar and the home
 * page both open it and neither can own it for the other.
 */
export const AppShell = ({ children }: { children?: ReactNode }) => {
  const onBoard = useMatch('/board/:boardId') !== null;
  const { pathname } = useLocation();
  const isLarge = useMediaQuery(LARGE, true);

  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [shownPath, setShownPath] = useState(pathname);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Both adjustments are made while rendering, which is how React asks for
  // state that follows other state: an effect would paint one frame of the
  // panel over the new page first. Going to another address closes the panel,
  // and so does the window growing past the breakpoint, so that shrinking it
  // again does not bring back a panel nobody opened.
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setPanelOpen(false);
  }
  if (isLarge && panelOpen) setPanelOpen(false);

  const asDialog = !isLarge && panelOpen;
  const closePanel = () => setPanelOpen(false);

  useFocusTrap(panelRef, asDialog);
  // A dialog opened from the panel, such as the create board form, answers
  // Escape itself. Both listeners hear the same key, and the panel must not
  // close underneath a dialog that has just closed.
  useEscapeKey(asDialog, () => {
    if (!document.querySelector('[role="dialog"][aria-modal="true"]')) closePanel();
  });

  const shell = useMemo(
    () => ({ headerSlot, openCreateBoard: () => setCreatingBoard(true) }),
    [headerSlot]
  );

  const menuButton = (
    <IconButton
      type="button"
      size="lg"
      aria-label="Open navigation"
      aria-expanded={panelOpen}
      aria-controls={SIDEBAR_ID}
      onClick={() => setPanelOpen(true)}
      className="-ml-2 lg:hidden"
    >
      <Icon as={IconMenu2} size={22} />
    </IconButton>
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className="relative grid h-dvh grid-cols-1 overflow-hidden bg-ground bg-[image:var(--gradient-ground)] lg:grid-cols-[252px_minmax(0,1fr)]">
        {/* Closed, the panel is invisible once it has slid out and inert
            throughout, so nothing in it can be seen, tabbed to or read. */}
        <div
          id={SIDEBAR_ID}
          ref={panelRef}
          role={asDialog ? 'dialog' : undefined}
          aria-label={asDialog ? 'Navigation' : undefined}
          inert={!isLarge && !panelOpen}
          className={`fixed bottom-3 left-3 top-3 z-40 flex w-[min(300px,calc(100vw-3rem))] min-h-0 transition-[transform,visibility] duration-300 ease-standard lg:visible lg:static lg:z-[2] lg:my-3 lg:ml-3 lg:w-auto lg:translate-x-0 ${
            panelOpen ? 'visible translate-x-0' : 'invisible -translate-x-[calc(100%+1.5rem)]'
          }`}
        >
          <Sidebar
            onCreateBoard={shell.openCreateBoard}
            onNavigate={closePanel}
            onClose={closePanel}
            className="flex w-full"
          />
        </div>

        {asDialog && (
          // A decorative backdrop: a pointer closes the panel by pressing it,
          // and a keyboard has Escape and the close button inside the panel,
          // so it is neither focusable nor announced.
          <div aria-hidden="true" onClick={closePanel} className="fixed inset-0 z-30 bg-scrim animate-bb-fade" />
        )}

        <div
          inert={asDialog}
          className="relative z-[1] flex min-h-0 min-w-0 flex-col px-4 pt-3 lg:pl-[22px] lg:pr-[18px]"
        >
          <ShellHeader slotRef={setHeaderSlot} menuButton={menuButton} />
          <main
            id="main"
            className={`flex min-h-0 flex-1 flex-col px-1 ${onBoard ? 'overflow-hidden' : 'overflow-y-auto pb-8 pt-2'}`}
          >
            {children ?? <Outlet />}
          </main>
        </div>
      </div>

      <CreateBoardDialog open={creatingBoard} onClose={() => setCreatingBoard(false)} />
    </ShellContext.Provider>
  );
};

export default AppShell;
