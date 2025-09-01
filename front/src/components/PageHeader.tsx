import { useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
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
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {showBackButton && (
              <button
                type="button"
                onClick={handleBack}
                aria-label={backAriaLabel}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <ArrowLeft size={20} className="text-gray-600" aria-hidden="true" />
              </button>
            )}

            <div>
              {/* Title: main landmark for the page */}
              <h1 className="text-2xl font-bold text-gray-900 font-heading">{title}</h1>
              {subtitle && (
                <p className="text-gray-600 font-body" aria-live="polite">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Action area */}
          <div className="flex items-center gap-4" aria-label="page actions">
            {children}
          </div>
        </div>
      </div>
    </header>
  );
};

export default PageHeader;
