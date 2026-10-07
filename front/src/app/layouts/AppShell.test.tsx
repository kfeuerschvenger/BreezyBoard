import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <p>page content</p>
      </AppShell>
    </MemoryRouter>
  );

describe('AppShell', () => {
  it('renders no footer on the board page', () => {
    renderAt('/board/abc123');

    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it.each(['/', '/profile', '/login'])('still renders the footer on %s', path => {
    renderAt(path);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
