import React from 'react';

export interface LoadingScreenProps {
  /**
   * What is being waited for, announced rather than only drawn.
   * Shown as text below the spinner when `showLabel` is set.
   */
  label?: string;
  showLabel?: boolean;
}

/**
 * A page that has nothing to show yet.
 *
 * The spinner carries `role="status"` and a name. Without them it is a
 * rotating border and nothing else: the page reads as empty to anyone not
 * looking at it, which is the gap `Board.test.tsx` had written into a comment
 * rather than into the markup.
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({ label = 'Loading', showLabel = false }) => (
  <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
    <div className="text-center">
      <div
        role="status"
        aria-label={label}
        className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"
      />
      {showLabel && <p className="text-gray-600 mt-4">{label}</p>}
    </div>
  </div>
);

export default LoadingScreen;
