import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LegalModal from './LegalModal';

const renderModal = () =>
  render(<LegalModal open onClose={vi.fn()} title="Terms of Service - BreezyBoard" filePath="/terms.txt" />);

describe('LegalModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the wind mark with a name while the document is on its way', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderModal();

    expect(await screen.findByRole('status', { name: 'Loading document...' })).toBeInTheDocument();
    expect(screen.getByText('Loading document...')).toBeInTheDocument();
  });

  it('shows the document and no loading state once it has arrived', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Be kind to the wind.')));
    renderModal();

    expect(await screen.findByText('Be kind to the wind.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says it could not load the document and offers Try again, which loads it', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(new Response('Second time lucky.'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load document.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Second time lucky.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
