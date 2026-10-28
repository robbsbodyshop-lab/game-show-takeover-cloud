import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createPhoneRoomRepo, teamsFromRpc } from './phoneRooms';

interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

const repoFor = (result: RpcResult) => {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { rpc, repo: createPhoneRoomRepo({ rpc } as unknown as SupabaseClient) };
};

describe('phone room repository', () => {
  it('joins with the SQL parameter names and a normalised code', async () => {
    const { rpc, repo } = repoFor({
      data: { event_id: 'e1', teams: [{ id: 2, name: 'Blues', color: '#00f', score: 99 }, 'junk'] },
      error: null,
    });
    const result = await repo.joinRoom(' dmkt ', 2, 'Sam');
    expect(rpc).toHaveBeenCalledWith('join_room', { p_code: 'DMKT', p_team: 2, p_nickname: 'Sam' });
    expect(result).toEqual({
      ok: true,
      room: { code: 'DMKT', eventId: 'e1', teams: [{ id: 2, name: 'Blues', color: '#00f' }] },
    });
  });

  it('maps an unknown room, a rate limit and a bad response', async () => {
    expect(await repoFor({ data: { error: 'not_found' }, error: null }).repo.joinRoom('DMKT', 1, '')).toEqual(
      {
        ok: false,
        reason: 'not_found',
      },
    );
    expect(
      await repoFor({ data: null, error: { message: 'rate_limited', code: 'PT429' } }).repo.joinRoom(
        'DMKT',
        1,
        '',
      ),
    ).toEqual({ ok: false, reason: 'rate_limited' });
    await expect(repoFor({ data: 42, error: null }).repo.joinRoom('DMKT', 1, '')).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(
      repoFor({ data: null, error: { message: 'boom' } }).repo.joinRoom('DMKT', 1, ''),
    ).rejects.toThrow('boom');
  });

  it('touches and leaves through their RPCs and refuses host-only calls', async () => {
    const { rpc, repo } = repoFor({ data: null, error: null });
    await repo.touchRoom('dmkt');
    await repo.leaveRoom();
    expect(rpc).toHaveBeenNthCalledWith(1, 'touch_room', { p_code: 'DMKT' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'leave_room', undefined);
    await expect(repo.openRoom('e1')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(repo.joinRoomAsHost('DMKT')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps only well-formed teams', () => {
    expect(teamsFromRpc('nope')).toEqual([]);
    expect(
      teamsFromRpc([
        { id: 1, name: 'A', color: 'red' },
        { id: '2', name: 'B', color: 'x' },
        null,
        { id: 3.5, name: 'C', color: 'y' },
      ]),
    ).toEqual([{ id: 1, name: 'A', color: 'red' }]);
  });
});
