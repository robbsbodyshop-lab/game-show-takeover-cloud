import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StageApp } from './StageApp';
import {
  createTestServices,
  HOST_EMAIL,
  HOST_PASSWORD,
  renderWithServices,
  signUpHost,
  type TestServices,
} from './testKit';

vi.mock('qrcode', () => ({ toCanvas: vi.fn(() => Promise.resolve()) }));

const fillCredentials = async (user: ReturnType<typeof userEvent.setup>, email: string, password: string) => {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
};

describe('StageApp boot and auth gate', () => {
  let services: TestServices;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('gst:booted', '1');
    services = createTestServices('supabase');
  });

  it('shows the boot screen once per browser session, and a key press skips it', async () => {
    sessionStorage.clear();
    renderWithServices(<StageApp />, services);
    expect(screen.getByRole('status', { name: 'Starting' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: 'Host sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem('gst:booted')).toBe('1');
    expect(screen.queryByRole('status', { name: 'Starting' })).toBeNull();
  });

  it('does not boot again when the session flag is set', async () => {
    renderWithServices(<StageApp />, services);
    expect(screen.queryByRole('status', { name: 'Starting' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Host sign in' })).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in', async () => {
    renderWithServices(<StageApp />, services);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue as demo host' })).toBeNull();
  });

  it('shows inline errors for a bad email and a short password', async () => {
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await fillCredentials(user, 'not-an-email', 'abcdef');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid email');

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), HOST_EMAIL);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 6');
  });

  it('shows the service error inline when the credentials are wrong', async () => {
    await signUpHost(services.data);
    await services.data.auth.signOut();
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await fillCredentials(user, HOST_EMAIL, 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.queryByRole('heading', { name: 'Your events' })).toBeNull();
  });

  it('signs up a new host and lands on the event list', async () => {
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await user.click(screen.getByRole('button', { name: 'New here? Sign up' }));
    expect(screen.getByRole('heading', { name: 'Create your host account' })).toBeInTheDocument();
    await fillCredentials(user, HOST_EMAIL, HOST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('heading', { name: 'Your events' })).toBeInTheDocument();
    expect(screen.getByText(HOST_EMAIL)).toBeInTheDocument();
  });

  it('refuses to sign up an email that already has an account', async () => {
    await signUpHost(services.data);
    await services.data.auth.signOut();
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await user.click(screen.getByRole('button', { name: 'New here? Sign up' }));
    await fillCredentials(user, HOST_EMAIL, HOST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already registered');
  });

  it('signs in an existing host with a password, and signs out again', async () => {
    await signUpHost(services.data);
    await services.data.auth.signOut();
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await fillCredentials(user, HOST_EMAIL, HOST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Your events' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Host sign in' })).toBeInTheDocument();
  });

  it('offers a magic link, which signs in at once on the memory auth', async () => {
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await user.type(screen.getByLabelText('Email'), HOST_EMAIL);
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    expect(await screen.findByRole('heading', { name: 'Your events' })).toBeInTheDocument();
  });

  it('tells the visitor to check their email when a link was sent and no session came back', async () => {
    vi.spyOn(services.data.auth, 'signInWithMagicLink').mockResolvedValue({ ok: true, session: null });
    const user = userEvent.setup();
    renderWithServices(<StageApp />, services);
    await screen.findByLabelText('Email');
    await user.type(screen.getByLabelText('Email'), HOST_EMAIL);
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(`Check ${HOST_EMAIL}`);
  });

  it('treats an anonymous (phone) session as signed out', async () => {
    await services.data.auth.signInAnonymously();
    renderWithServices(<StageApp />, services);
    expect(await screen.findByRole('heading', { name: 'Host sign in' })).toBeInTheDocument();
  });

  it('in demo mode signs in a demo host automatically', async () => {
    const demo = createTestServices('demo');
    renderWithServices(<StageApp />, demo);
    expect(await screen.findByRole('heading', { name: 'Your events' })).toBeInTheDocument();
    expect(screen.getByText('demo@host.local')).toBeInTheDocument();
  });

  it('in demo mode, after signing out, offers to continue as the demo host', async () => {
    const demo = createTestServices('demo');
    const user = userEvent.setup();
    renderWithServices(<StageApp />, demo);
    await screen.findByRole('heading', { name: 'Your events' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Continue as demo host' }));
    expect(await screen.findByRole('heading', { name: 'Your events' })).toBeInTheDocument();
  });

  it('opens a new event on the setup screen', async () => {
    const user = userEvent.setup();
    const demo = createTestServices('demo');
    renderWithServices(<StageApp />, demo);
    await screen.findByRole('heading', { name: 'Your events' });
    await user.type(screen.getByLabelText('New event name'), 'Friday night');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('heading', { name: 'Friday night' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Start Game!' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/Room code [BCDFGHJKLMNPQRSTVWXZ]{4}/)).toBeInTheDocument();
    });
  });
});
