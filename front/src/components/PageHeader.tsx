import { useCallback } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { Icon, IconButton } from '@/shared/ui';
import { useNavigate } from 'react-router-dom';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Show a back button on the left side */
  showBackButton?: boolean;
  /**
   * Optional custom back handler. If it returns a Promise it will be awaited.
   * If not provided, the component will call `navigate(-1)`.
   */
  onBack?: () => void | Promise<void>;
  /** Accessible label for the back button (defaults to "Go back") */
  backAriaLabel?: string;
  children?: React.ReactNode;
  /** Extra classes for the outer container */
  className?: string;
}

/**
 * PageHeader
 * The title block at the top of a page's own content: the h1, an optional
 * subtitle, a back button and the page's own actions.
 *
 * It is not the application's header. That one is the shell's and holds the
 * breadcrumb and the view's main action, and this sits in the page below it.
 * It is a `header` element inside the page's `main`, which makes it a
 * sectioning header rather than a second banner landmark.
 */
const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  showBackButton = false,
  onBack,
  backAriaLabel = 'Go back',
  children,
  className = '',
}) => {
  const navigate = useNavigate();

  // Memoized back handler to avoid recreating on each render.
  const handleBack = useCallback(async () => {
    if (typeof onBack === 'function') {
      try {
        await onBack();
      } catch {
        //console.error('onBack handler threw an error');
      }
    } else {
      // default behavior: go back in history
      navigate(-1);
    }
  }, [navigate, onBack]);

  return (
    <header className={`pb-5 pt-1 ${className}`}>
      {/*
        The row wraps instead of squeezing. On a phone the title block and
        the actions do not fit side by side, and a long title would
        otherwise push the actions out of the viewport: the title may shrink
        to a minimum width, and once it would go below it the actions drop to
        their own line, right aligned.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3 sm:gap-4">
          {showBackButton && (
            <IconButton type="button" size="lg" onClick={handleBack} aria-label={backAriaLabel} className="shrink-0">
              <Icon as={IconArrowLeft} size={20} aria-hidden="true" />
            </IconButton>
          )}

          <div className="min-w-0">
            {/* Title: main landmark for the page */}
            <h1 className="break-words font-heading text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {subtitle && (
              <p className="font-body text-sm text-ink-secondary sm:text-base" aria-live="polite">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/*
          A layout wrapper, so it carries no aria-label. ARIA prohibits one
          on an element with no role, which axe reports as
          aria-prohibited-attr, and the actions inside already name
          themselves.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">{children}</div>
      </div>
    </header>
  );
};

export default PageHeader;
