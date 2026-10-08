import { useCallback } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
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
 * - Semantic header component with optional back button and action area.
 * - Focus / keyboard and aria improvements for accessibility.
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
    <header role="banner" className={`bg-white border-b border-gray-200 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
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
              <button
                type="button"
                onClick={handleBack}
                aria-label={backAriaLabel}
                className="shrink-0 p-3 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Icon as={IconArrowLeft} size={20} className="text-gray-600" aria-hidden="true" />
              </button>
            )}

            <div className="min-w-0">
              {/* Title: main landmark for the page */}
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-heading break-words">{title}</h1>
              {subtitle && (
                <p className="text-sm sm:text-base text-gray-600 font-body" aria-live="polite">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/*
            A layout wrapper, so it carries no aria-label. ARIA prohibits one
            on an element with no role, and the actions inside already name
            themselves. The axe gate reported it the first time a surface
            rendering this header with an empty action area was scanned.
          */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">{children}</div>
        </div>
      </div>
    </header>
  );
};

export default PageHeader;
