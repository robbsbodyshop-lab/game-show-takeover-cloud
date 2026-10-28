# Tech Stack Steering

> Status: Draft for owner review · Last updated: 2026-10-28
> Versions below are the latest on npm on 2026-10-28; pin exact majors in package.json.

## Runtime / Platform

- Node 22 LTS for tooling and CI (`.nvmrc`). npm as the package manager.
- Static frontend deployed to **Vercel** (Hobby plan; non-commercial use only
  per Vercel's fair-use terms). No Vercel serverless functions are required.
- **Supabase** (Free plan, org "robbsbodyshop-lab's Org") for Auth, Postgres
  and Realtime. Free projects pause after 7 days without database activity;
  see Constraints.

## Frontend

- React 19 + TypeScript 5.x in strict mode, built with Vite 8 (verify
  `@vitejs/plugin-react` 6 compatibility at scaffold time; fall back to Vite 7
  if any dependency lags).
- Styling: plain CSS with custom properties (design tokens) plus CSS Modules
  per component. No Tailwind: the design system is small and bespoke, and
  Tailwind 4's engine adds nothing the token sheet does not.
- Routing: a tiny path-based router of our own (`/`, `/play`, `/host`, `/e/:id`);
  no router dependency.
- State: pure reducers in framework-free TypeScript; React binds through
  `useReducer` / `useSyncExternalStore`. No global state library.
- Fonts bundled from `@fontsource` (Press Start 2P, Pixelify Sans, Silkscreen;
  SIL OFL). Nothing loads from a CDN at runtime.
- Audio: Web Audio API playing the existing MP3 cues from `public/audio`.
- Voice: Web Speech API (`SpeechRecognition`) behind a feature check; Chrome
  and Edge only.
- QR codes: `qrcode` (MIT) rendered to a canvas.
- Validation: `zod` 4 for content files, saved sessions and realtime payloads.

## Backend (Supabase)

- **Auth:** email + password and magic link for hosts; `signInAnonymously`
  for phones (anonymous sign-ins enabled in the project).
- **Postgres:** `profiles`, `events`, `event_snapshots`, `rooms`,
  `room_members`, `host_settings`. Row Level Security on every table.
  Migrations in `supabase/migrations`, applied with the Supabase CLI
  (`supabase` 2.x) or the Supabase MCP `apply_migration`.
- **Realtime:** Broadcast and Presence on **private channels** authorised by
  RLS policies on `realtime.messages` ("Allow public access" disabled).
  Two topics per room: `room:<code>:stage` (host writes, everyone reads) and
  `room:<code>:phones:<team>` (one per team; a phone writes only on its own team, host reads all eight). Postgres Changes are not
  used.
- **Client:** `@supabase/supabase-js` 2.x behind a `RoomTransport` interface so
  tests and local demos run on an in-memory transport.

## Testing / Verification

- Lint: `npm run lint` (ESLint 9/10 flat config, typescript-eslint, react-hooks)
- Format: `npm run format:check` (Prettier 3)
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Unit and component: `npm test` (Vitest 5, jsdom, Testing Library)
- End to end: `npm run e2e` (Playwright, Chromium, in-memory transport)
- Everything: `npm run validate` (what CI runs)

## Constraints

- Free-tier quotas (Supabase docs, 2026-10-28): 200 concurrent Realtime
  connections, 100 messages/s, 20 presence messages/s, 256 KB broadcast
  payload, 2M messages/month, 500 MB database, 50k monthly active users.
  An event is one stage, a few host views and up to 8 phones, well inside.
- Free projects pause after 7 idle days. Mitigation: a GitHub Actions cron
  pings a tiny `keepalive` RPC daily; the README recommends Pro ($25/mo) for
  anyone running real events. The pause risk is documented in the host guide.
- Vercel Hobby is non-commercial only. Charging for events requires Pro.
- No secrets in the browser bundle: the Supabase anon key is public by design;
  everything else is enforced by RLS.
- Phones must work on iOS Safari and Android Chrome of the last 2 years.

## Architectural Decisions

- **Static SPA + Supabase, no custom server:** the only server-side logic the
  game needs is identity, storage and fan-out of small messages, all of which
  Supabase provides; the rule engines stay in the browser as before.
- **Private Realtime channels with RLS:** stops a phone from impersonating the
  stage or another team, which a public channel with a shared code cannot.
- **Pure engines with injected randomness and content:** every rule is unit
  tested deterministically; the UI only renders and judges text.
- **Snapshot persistence of engine state:** because engine state is plain
  serializable data, the whole game (not just the event) is saved on every
  action and resumes exactly.
