import { Link } from 'react-router-dom';
import { IconSearchOff } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { LoadingScreen, Icon } from '@/shared/ui';
import PageHeader from '../components/PageHeader';

export interface NotFoundProps {
  /** What was not found. It is the page's h1 and the first words of the tab title. */
  title?: string;
  /** What happened, in a sentence the person can act on. */
  description?: string;
}

const LINK_CLASSES =
  'focus-ring inline-flex h-11 items-center justify-center rounded-control bg-ink px-5 text-[15px] font-semibold text-white shadow-button transition-colors hover:bg-ink-hover';

/**
 * A page for an address that leads nowhere: an unknown route, or a board that
 * is missing, deleted or not the caller's to read.
 *
 * It answers for both signed in and signed out visitors, because the router
 * decides what an unknown address is before anything decides who is asking.
 * A signed in visitor is inside the application shell, so the sidebar and the
 * account are still there, and gets a way back to their boards. A signed out
 * one gets the same message and a way to sign in, and is never redirected:
 * sending them to `/login` would make the address they typed vanish and tell
 * them nothing about what happened to it.
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
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-line-06" aria-hidden="true">
        <Icon as={IconSearchOff} size={28} className="text-ink-secondary" />
      </div>
      <p className="mx-auto mb-6 max-w-md text-ink-secondary">{description}</p>
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

  // A signed in visitor is inside the application shell, whose `main` and
  // header this sits in: rendering a `main` of its own would nest a second
  // landmark in the first. A signed out one has no shell and is its own page.
  if (isAuthenticated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title={title} />
        <div className="flex flex-1 items-center justify-center px-4 py-12">{message}</div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ground px-4 py-16">
      <h1 className="mb-6 text-center font-heading text-2xl font-bold text-ink">{title}</h1>
      {message}
    </main>
  );
};

export default NotFound;
