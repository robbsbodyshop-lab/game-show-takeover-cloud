import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { channelPlan } from './roles';

/**
 * Realtime refuses to JOIN a private channel unless a SELECT policy on realtime.messages passes for
 * the topic, even when an INSERT policy exists (learned in production, migration 0003). This static
 * check reads the migrations and makes sure every channel a role joins has a read policy that role
 * can satisfy, so a write-only topic can never ship again.
 */
const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

const policies = [
  ...sql.matchAll(/create policy\s+"([^"]+)"\s+on realtime\.messages\s+for (select|insert)[\s\S]*?\);\n/gi),
].map((m) => ({ name: m[1] ?? '', cmd: (m[2] ?? '').toLowerCase(), body: m[0] }));

const mentionsKind = (body: string, kind: string): boolean => body.includes(`= '${kind}'`);
const ownerOnly = (body: string): boolean => /r\.owner_id\s*=\s*m\.user_id/.test(body);
const phoneRole = (body: string): boolean => /m\.role\s*=\s*'phone'/.test(body);

describe('realtime.messages policies cover the channel plan', () => {
  it('parses the six-plus policies from the migrations', () => {
    expect(policies.length).toBeGreaterThanOrEqual(7);
  });

  it('a phone has a SELECT policy for every channel it joins', () => {
    for (const spec of channelPlan('phone', 3)) {
      const readers = policies.filter((p) => p.cmd === 'select' && mentionsKind(p.body, spec.kind));
      const phoneCanPass = readers.some((p) => !ownerOnly(p.body) || phoneRole(p.body));
      expect(phoneCanPass, `no SELECT policy a phone can pass for topic kind "${spec.kind}"`).toBe(true);
    }
  });

  it('owner sessions (stage, host) have a SELECT policy for every channel they join', () => {
    for (const role of ['stage', 'host'] as const) {
      for (const spec of channelPlan(role)) {
        const readers = policies.filter((p) => p.cmd === 'select' && mentionsKind(p.body, spec.kind));
        expect(readers.length, `${role} cannot join topic kind "${spec.kind}"`).toBeGreaterThan(0);
      }
    }
  });

  it('a phone that may write its phones topic may also read it', () => {
    const writes = policies.some(
      (p) => p.cmd === 'insert' && mentionsKind(p.body, 'phones') && phoneRole(p.body),
    );
    const reads = policies.some(
      (p) => p.cmd === 'select' && mentionsKind(p.body, 'phones') && phoneRole(p.body),
    );
    expect(writes).toBe(true);
    expect(reads).toBe(true);
  });
});
