import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

const Titled = ({ title }: { title: string }) => {
  useDocumentTitle(title);
  return null;
};

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'Boards';
  });

  it('sets the title while mounted', () => {
    render(<Titled title="Page not found | BreezyBoard" />);

    expect(document.title).toBe('Page not found | BreezyBoard');
  });

  it('follows the title when it changes', () => {
    const { rerender } = render(<Titled title="First" />);
    rerender(<Titled title="Second" />);

    expect(document.title).toBe('Second');
  });

  it('puts back the title it replaced on unmount', () => {
    const { unmount } = render(<Titled title="Page not found | BreezyBoard" />);
    unmount();

    expect(document.title).toBe('Boards');
  });
});
