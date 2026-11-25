import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const rooms = [
  { id: 'room-a', name: 'Atlas', building: 'A', floor: 1, capacity: 6, equipment: 'Projektor' },
  { id: 'room-b', name: 'Borealis', building: 'B', floor: 2, capacity: 12, equipment: null },
];
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_TEST_USER_ID', 'user-1');
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true, json: async () => url.endsWith('/rooms') ? rooms : [],
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

async function showApp() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Atlas' });
}

function submitBooking() {
  fireEvent.change(screen.getByLabelText('Konferenčna soba'), { target: { value: 'room-a' } });
  fireEvent.change(screen.getByLabelText('Začetek rezervacije'), { target: { value: '2026-12-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Konec rezervacije'), { target: { value: '2026-12-01T11:00' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Rezerviraj sobo' }).closest('form')!);
}

describe('room browser', () => {
  it('shows a loading message before rooms arrive', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('Nalaganje sob ...')).toBeInTheDocument();
  });
  it('renders rooms returned by the API', async () => {
    await showApp();
    expect(screen.getByRole('heading', { name: 'Borealis' })).toBeInTheDocument();
    expect(screen.getByText('Konferenčne sobe (2)')).toBeInTheDocument();
  });
  it('filters by building', async () => {
    await showApp();
    await userEvent.selectOptions(screen.getByLabelText('Stavba'), 'A');
    expect(screen.queryByRole('heading', { name: 'Borealis' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Atlas' })).toBeInTheDocument();
  });
  it('filters by minimum capacity', async () => {
    await showApp();
    fireEvent.change(screen.getByLabelText('Minimalna kapaciteta'), { target: { value: '10' } });
    expect(screen.queryByRole('heading', { name: 'Atlas' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Borealis' })).toBeInTheDocument();
  });
  it('matches equipment regardless of case', async () => {
    await showApp();
    await userEvent.type(screen.getByLabelText('Oprema'), 'PROJEKTOR');
    expect(screen.getByRole('heading', { name: 'Atlas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Borealis' })).not.toBeInTheDocument();
  });
  it('shows an empty state when no rooms match', async () => {
    await showApp();
    fireEvent.change(screen.getByLabelText('Minimalna kapaciteta'), { target: { value: '100' } });
    expect(screen.getByText('Nobena soba ne ustreza izbranim filtrom.')).toBeInTheDocument();
  });
  it('resets filters', async () => {
    await showApp();
    await userEvent.selectOptions(screen.getByLabelText('Stavba'), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Ponastavi filtre' }));
    expect(screen.getByRole('heading', { name: 'Borealis' })).toBeInTheDocument();
    expect(screen.getByLabelText('Stavba')).toHaveValue('');
  });
  it('selects a room for the reservation form', async () => {
    await showApp();
    await userEvent.click(screen.getAllByRole('button', { name: 'Izberi sobo' })[0]);
    expect(screen.getByLabelText('Konferenčna soba')).toHaveValue('room-a');
  });
  it('shows a server error if loading rooms fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    render(<App />);
    expect(await screen.findByText('Povezava s strežnikom ni uspela.')).toBeInTheDocument();
  });
  it('rejects a reversed reservation interval without sending a booking', async () => {
    await showApp();
    fireEvent.change(screen.getByLabelText('Konferenčna soba'), { target: { value: 'room-a' } });
    fireEvent.change(screen.getByLabelText('Začetek rezervacije'), { target: { value: '2026-12-01T11:00' } });
    fireEvent.change(screen.getByLabelText('Konec rezervacije'), { target: { value: '2026-12-01T10:00' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Rezerviraj sobo' }).closest('form')!);
    expect(await screen.findByText('Končni čas mora biti poznejši od začetnega.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });
  it('shows reservations returned for the configured user', async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith('/rooms') ? rooms : [{
      id: 'booking-1', roomId: 'room-a', room: { name: 'Reserved room', building: 'A' },
      startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T11:00:00Z', purpose: 'Workshop', status: 'CONFIRMED',
    }] }));
    await showApp();
    expect(await screen.findByRole('heading', { name: 'Reserved room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uredi' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/users/user-1/reservations')));
  });
  it('checks availability before creating a reservation', async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => ({
      ok: true, json: async () => url.endsWith('/rooms') ? rooms
        : url.includes('/availability?') ? { available: true }
        : options?.method === 'POST' ? { id: 'new-booking' } : [],
    }));
    await showApp();
    submitBooking();
    expect(await screen.findByText('Rezervacija uspešna! ID: new-booking')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(post).toBeDefined();
    expect(JSON.parse(post![1].body)).toMatchObject({ userId: 'user-1', roomId: 'room-a' });
    expect(screen.getByLabelText('Začetek rezervacije')).toHaveValue('');
  });
  it('does not create a reservation for an occupied room', async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () =>
      url.endsWith('/rooms') ? rooms : url.includes('/availability?') ? { available: false } : [],
    }));
    await showApp();
    submitBooking();
    expect(await screen.findByText('Soba je v izbranem terminu zasedena.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('displays availability API errors and enables retry', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: !url.includes('/availability?'), json: async () => url.endsWith('/rooms') ? rooms
        : url.includes('/availability?') ? { error: 'Unavailable service' } : [],
    }));
    await showApp();
    submitBooking();
    expect(await screen.findByText('Unavailable service')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rezerviraj sobo' })).toBeEnabled();
  });
});
