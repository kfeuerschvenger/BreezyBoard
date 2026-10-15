import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

const Titled = ({ title }: { title: string | null }) => {
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

  it('leaves the title alone for null, and takes it when a title arrives', () => {
    const { rerender } = render(<Titled title={null} />);
    expect(document.title).toBe('Boards');

    rerender(<Titled title="Named" />);
    expect(document.title).toBe('Named');

    rerender(<Titled title={null} />);
    expect(document.title).toBe('Boards');
  });

  it('puts back the title it replaced on unmount', () => {
    const { unmount } = render(<Titled title="Page not found | BreezyBoard" />);
    unmount();

    expect(document.title).toBe('Boards');
  });
});
