import React, { useId } from 'react';

export interface ProfilePanelProps {
  title: string;
  /** One sentence under the title, when the panel needs to say what it is for. */
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A section of the profile: a frosted panel named by its own heading.
 *
 * It is a `section` labelled by its `h2`, so each panel is a landmark a
 * screen reader can jump to and the page's heading order runs from the `h1`
 * of the summary straight to these.
 */
export const ProfilePanel: React.FC<ProfilePanelProps> = ({ title, description, children, className = '' }) => {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`animate-bb-up rounded-panel border border-glass-border bg-glass-strong p-6 shadow-tile backdrop-blur-[14px] sm:p-7 ${className}`}
    >
      <h2 id={headingId} className="font-heading text-xl font-[650] tracking-[-0.02em] text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-ink-secondary">{description}</p>}

      <div className="mt-5">{children}</div>
    </section>
  );
};

export default ProfilePanel;
