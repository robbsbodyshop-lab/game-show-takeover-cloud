import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer } from './index';
import { createFakeSupabase, ok } from './repositories/supabase/fakeSupabase';
import { ROOM_CODE_ALPHABET, generateRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode';
import { getConfiguredClient, resetConfiguredClientForTests } from './supabaseClient';

describe('getConfiguredClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfiguredClientForTests();
  });

  it('returns null in demo mode (variables missing or blank)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    resetConfiguredClientForTests();
    expect(getConfiguredClient()).toBeNull();

    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '   ');
    resetConfiguredClientForTests();
    expect(getConfiguredClient()).toBeNull();
  });

  it('builds one shared client when both variables are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    resetConfiguredClientForTests();
    const client = getConfiguredClient();
    expect(client).not.toBeNull();
    expect(getConfiguredClient()).toBe(client);
  });
});

describe('createDataLayer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfiguredClientForTests();
  });

  it('demo mode works end to end without a network', async () => {
    const layer = createDataLayer('demo');
    expect(layer.mode).toBe('demo');
    await layer.auth.signUp('demo@example.com', 'correct horse');
    const event = await layer.events.createEvent('Demo');
    expect(await layer.rooms.openRoom(event.id)).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  });

  it('supabase mode needs a configured client', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    resetConfiguredClientForTests();
    expect(() => createDataLayer('supabase')).toThrow(/not configured/);
  });

  it('supabase mode uses an injected client', async () => {
    const fake = createFakeSupabase(() => ok('BCDF'));
    const layer = createDataLayer('supabase', { client: fake.client });
    expect(layer.mode).toBe('supabase');
    expect(await layer.rooms.openRoom('e1')).toBe('BCDF');
    expect(fake.calls[0]?.target).toBe('rpc:open_room');
  });
});

describe('room codes', () => {
  it('uses 20 consonants and generates valid codes', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(20);
    expect(/[AEIOUY]/.test(ROOM_CODE_ALPHABET)).toBe(false);
    expect(generateRoomCode(() => 0)).toBe('BBBB');
    expect(generateRoomCode(() => 0.999999)).toBe('ZZZZ');
    for (let i = 0; i < 200; i += 1) expect(isValidRoomCode(generateRoomCode())).toBe(true);
  });

  it('normalises and validates', () => {
    expect(normalizeRoomCode('  bcdf ')).toBe('BCDF');
    expect(isValidRoomCode('BCDA')).toBe(false);
    expect(isValidRoomCode('BCD')).toBe(false);
  });
});
