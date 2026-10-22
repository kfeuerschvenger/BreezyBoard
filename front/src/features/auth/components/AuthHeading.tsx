import React from 'react';

export interface AuthHeadingProps {
  title: string;
  subtitle: string;
  /**
   * For a page that moves focus to its title when the screen changes under the
   * reader, so what is announced next is the new title and not the page chrome.
   */
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * The title and the line under it, at the head of every page beside the
 * branding column. The title is the page's `h1`: the branding column's
 * headline is a paragraph, so this is the only one.
 *
 * It takes focus when asked and is not in the tab order, which is why it
 * carries `tabIndex={-1}` and no outline: a heading is not a control, and a
 * ring around it would suggest it is one.
 */
export const AuthHeading: React.FC<AuthHeadingProps> = ({ title, subtitle, headingRef }) => (
  <div className="flex flex-col gap-2">
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="font-heading text-[38px] font-bold leading-[1.1] tracking-[-0.03em] text-ink outline-none"
    >
      {title}
    </h1>
    <p className="text-[15px] leading-normal text-ink-secondary">{subtitle}</p>
  </div>
);

export default AuthHeading;
