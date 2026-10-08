import { Link } from 'react-router-dom';
import { IconSearchOff } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { LoadingScreen, Icon } from '@/shared/ui';
import PageHeader from '../components/PageHeader';
import UserAvatar from '../components/UserAvatar';

export interface NotFoundProps {
  /** What was not found. It is the page's h1 and the first words of the tab title. */
  title?: string;
  /** What happened, in a sentence the person can act on. */
  description?: string;
}

const LINK_CLASSES =
  'inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

/**
 * A page for an address that leads nowhere: an unknown route, or a board that
 * is missing, deleted or not the caller's to read.
 *
 * It answers for both signed in and signed out visitors, because the router
 * decides what an unknown address is before anything decides who is asking.
 * A signed in visitor gets the app's own header, so the account menu is still
 * there, and a way back to their boards. A signed out one gets the same
 * message and a way to sign in, and is never redirected: sending them to
 * `/login` would make the address they typed vanish and tell them nothing
 * about what happened to it.
 */
const NotFound = ({
  title = 'Page not found',
  description = 'There is nothing at this address. The link may be mistyped, or the page may have moved.',
}: NotFoundProps) => {
  const { isAuthenticated, loading } = useAuth();

  useDocumentTitle(`${title} | BreezyBoard`);

  if (loading) return <LoadingScreen label="Loading" />;

  const message = (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100" aria-hidden="true">
        <Icon as={IconSearchOff} size={28} className="text-gray-500" />
      </div>
      <p className="mx-auto mb-6 max-w-md text-gray-600">{description}</p>
      {isAuthenticated ? (
        <Link to="/" className={LINK_CLASSES}>
          Back to my boards
        </Link>
      ) : (
        <Link to="/login" className={LINK_CLASSES}>
          Go to sign in
        </Link>
      )}
    </div>
  );

  // `min-h-0 flex-1` lets this fill the app frame whichever way the frame is
  // sized: pinned to the viewport on the board route, growing with its
  // content everywhere else.
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50">
      {isAuthenticated ? (
        <>
          <PageHeader title={title}>
            <UserAvatar />
          </PageHeader>
          <main className="flex flex-1 items-center justify-center px-4 py-16">{message}</main>
        </>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
          <h1 className="mb-6 text-center font-heading text-2xl font-bold text-gray-900">{title}</h1>
          {message}
        </main>
      )}
    </div>
  );
};

export default NotFound;
