# Deployment runbook

This is the order to bring the hosted app up, check it, and keep it running. Each step says what
it needs and how to tell it worked. Sections 1 to 8 are the one-time setup. Section 9 is the
ongoing operations list. Section 10 lists the limits that are known today.

## 0. Status

| Item                                                                              | State                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| Supabase project `qkolbdllyinnycyqygrm`, org "robbsbodyshop-lab's Org", Free plan | Created                                    |
| Migrations `supabase/migrations/0001_init.sql` and `0002_director_lease.sql`      | Written, **not applied**                   |
| Auth settings (anonymous, email, Site URL, redirect URLs)                         | **Not set**                                |
| Realtime "Allow public access"                                                    | **Not set** (must be off)                  |
| GitHub repo `robbsbodyshop-lab/game-show-takeover-cloud`                          | **Not created** (local git only)           |
| Vercel project linked to that repo                                                | **Not created**                            |
| GitHub secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`                         | **Not set**                                |
| Keep-alive workflow (`.github/workflows/keepalive.yml`)                           | In the repo; never run against the project |

> **Applied 2026-11-04.** Both migrations are live on project `qkolbdllyinnycyqygrm`, applied through
> the Supabase MCP in three parts (`init_public_schema_rls_rpcs`, `director_lease`,
> `realtime_room_policies`). One gotcha for a fresh or just-restored project: `realtime.messages`
> does not exist until the Realtime service has booted the tenant once, so the six channel policies
> fail with `relation "realtime.messages" does not exist`. Open any Realtime channel from a client
> (even a throwaway `supabase.channel('probe').subscribe()`), wait a few seconds, then apply the
> policies. If you later use `supabase db push`, run `supabase migration repair` first so the CLI's
> history matches what is already applied.

## 1. Supabase project (done)

| Setting      | Value                                      |
| ------------ | ------------------------------------------ |
| Project ref  | `qkolbdllyinnycyqygrm`                     |
| API URL      | `https://qkolbdllyinnycyqygrm.supabase.co` |
| Region       | us-east-1                                  |
| Organisation | robbsbodyshop-lab's Org                    |
| Plan         | Free                                       |

Free projects pause after 7 days without database activity. A paused project can be restored from
the dashboard, and restoring works for up to a year. See section 9.1.

The app needs two values from this project. Both go to the browser or to the GitHub Actions
runner, so neither is a secret:

- `VITE_SUPABASE_URL` = `https://qkolbdllyinnycyqygrm.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key from the project's API settings

The publishable key is public by design. Row level security is what protects the data. Do not put a
secret or service-role key in the repo, in a `VITE_` variable, or in any browser-facing setting.

## 2. Apply the migrations

The schema is two files. Apply them **in this order**:

1. `supabase/migrations/0001_init.sql` creates the tables, RLS policies, the room and join RPCs, the
   six Realtime policies on `realtime.messages`, and the sign-up triggers.
2. `supabase/migrations/0002_director_lease.sql` adds `claim_director` and `release_director`. The
   stage calls `claim_director` before it opens a room, so a database with only 0001 shows no room
   code.

Apply each file once.

**Option A: Supabase CLI (preferred).** It applies every pending migration in order.

```bash
cd /home/user/game-show-takeover-cloud
supabase login
supabase link --project-ref qkolbdllyinnycyqygrm
supabase db push
```

`db push` asks for the database password that was set when the project was created.

**Option B: dashboard SQL editor.** Open SQL Editor, choose New query, paste the whole contents of
`supabase/migrations/0001_init.sql`, run it, then paste the whole contents of
`supabase/migrations/0002_director_lease.sql` and run it. If 0001 is already applied (an earlier
attempt, for example), paste only 0002. Do not apply the same file twice, and do not mix the CLI and
the dashboard for the same migration.

**Check it worked:**

- Table Editor lists `profiles`, `events`, `event_state`, `host_settings`, `rooms`, `room_members`
  and `join_attempts`.
- In SQL Editor, `select public.keepalive();` returns `1`.
- `select policyname from pg_policies where schemaname = 'realtime';` returns six policies.
- `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('claim_director', 'release_director') order by proname;` returns two rows.

Optional SQL tests: `supabase/tests/rls.sql` checks the policies, and `supabase/tests/director.sql`
checks the stage lease. Both need pgTAP, both run in a transaction that is rolled back, and both
need the two migrations in place. Run them with `supabase test db` on a local stack, or with `psql`
(see each file's header).

## 3. Authentication settings

Dashboard, Authentication:

| Setting            | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Email provider     | On, with email confirmations on                                             |
| Anonymous sign-ins | On (phones join without an account)                                         |
| Site URL           | The Vercel production URL. **Set this after step 6**, when Vercel shows it. |
| Redirect URLs      | Add `https://*.vercel.app/**` so preview deployments can sign in            |

For local development against this project, also add `http://localhost:3000/**` to the redirect
URLs. Sign-in email links then return to the dev server. The file `supabase/config.toml` lists a
different local port; it only affects `supabase start` and does not change the hosted project.

## 4. Realtime settings

Dashboard, Realtime settings: **"Allow public access" must be off.** With it off, a channel can be
joined only if the RLS policies from the migration allow it. Each phone joins only its own team's
topic (`room:<CODE>:phones:<TEAM>`), and the policies check that the team in the topic matches the
phone's `room_members.team`. That is what stops a phone from joining the stage topic or acting for
another team. If this setting is on, the room codes become the only protection.

## 5. Create the GitHub repo and push

The repo has a local git history (latest commit on `main`) and no remote yet. Check that the
working tree is clean and that `.env.local` is still ignored, then create the remote and push.
`.env.local` is ignored by git and must stay that way.

```bash
cd /home/user/game-show-takeover-cloud
git status
gh repo create robbsbodyshop-lab/game-show-takeover-cloud --private --source=. --remote=origin --push
```

Change `--private` to `--public` if the repo should be public. Note that GitHub stops scheduled
workflows in a public repository after 60 days with no repository activity. The app's keep-alive
depends on that schedule (section 9.1).

The default branch is `main`. CI runs on pushes to `main` and on pull requests. The first push
starts it. Wait for it to pass before continuing.

## 6. Create the Vercel project

1. In the Vercel dashboard, choose Add New, then Project. Import
   `robbsbodyshop-lab/game-show-takeover-cloud`. If Vercel asks, install its GitHub app for the
   organisation first.
2. Check the build settings. They come from `vercel.json`, so they should be filled in already:
   framework Vite, install `npm ci`, build `npm run build`, output `dist`. Set the Node.js version to
   22 to match `.nvmrc`.
3. Under Environment Variables, add these for **Production and Preview**:

   | Name                            | Value                                      |
   | ------------------------------- | ------------------------------------------ |
   | `VITE_SUPABASE_URL`             | `https://qkolbdllyinnycyqygrm.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The publishable key from step 1            |

4. Deploy. Note the production URL that Vercel shows.
5. Go back to step 3 and set the Supabase Site URL to that production URL.

Vite writes `VITE_` variables into the bundle at build time. A change to either variable takes
effect only after a new deployment. Redeploy after every change.

The build makes three pages: `index.html` (the stage, `/`), `play.html` (the phone, `/play`) and
`host.html` (the host view, `/host`). Each is its own chunk, so a phone never downloads the stage.
`vercel.json` rewrites `/play` and `/play/...` to `play.html`, `/host` and `/host/...` to `host.html`,
and everything else to `index.html`. It also sets the security headers (`X-Frame-Options: DENY`, no
camera or geolocation, microphone for this origin only) and the cache headers for `/assets` and
`/audio`.

Vercel's Hobby plan is for non-commercial use only. See section 9.2 before running a paid event.

## 7. Repo secrets for the keep-alive

In GitHub, open the repo's Settings, then Secrets and variables, then Actions. Add two repository
secrets:

| Secret                     | Value                                      |
| -------------------------- | ------------------------------------------ |
| `SUPABASE_URL`             | `https://qkolbdllyinnycyqygrm.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The publishable key                        |

Then open Actions, choose "Supabase keep-alive", and select Run workflow. It must finish green. It
calls the `keepalive` RPC once. The workflow also runs every day at 09:17 UTC.

## 8. Verify on the hosted URL

Work through this with a real phone on mobile data, not the venue Wi-Fi.

| #   | Step                                                          | Expected                                                                   |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Open the production URL.                                      | The boot screen plays once per browser session, then the sign-in screen.   |
| 2   | Sign up with an email address. Open the confirmation link.    | The link returns to the production URL and signs in.                       |
| 3   | Create an event and name the teams. Open the room.            | The join panel shows a four-letter room code and a QR code.                |
| 4   | On the phone, scan the QR code.                               | `/play?room=CODE` opens. Pick a team. The phone waits for the game screen. |
| 5   | Watch the stage.                                              | The phone appears in the stage's phone roster.                             |
| 6   | On a laptop, open `/host`, sign in, and enter the room code.  | The host view shows the stage snapshot.                                    |
| 7   | Reload the stage.                                             | The event resumes with the same teams and scores.                          |
| 8   | In Supabase Table Editor, look at `rooms` and `room_members`. | One room row. Member rows for the stage, the host and the phone.           |

**Before recording T27 as accepted:** start a Family Feud face-off (Enter, then Enter again to start
the face-off) and press BUZZ on the phone. The phone should show BUZZED! and the stage should accept
the press. All the games are registered, so this can be checked now. Step 5 is the test of the
phone's presence on its team topic under the write-only policies. If step 5 fails, the phone needs a
presence read policy; see the open risk R1 in `.ai/sdd/specs/001-cloud-rewrite/review.md`.

## 9. Operations

### 9.1 The pause risk and the keep-alive

Supabase pauses a Free project after 7 days without database activity. A paused project refuses
API calls, so the app stops working until someone restores it.

- The keep-alive workflow calls `keepalive()` once a day. That is one database call a day, far
  inside the 7-day limit.
- If the workflow fails, its run in the Actions tab shows the error. Fix it and run it again by
  hand.
- If the project is paused anyway, open it in the dashboard and restore it. Restoring is possible
  for up to a year after the pause.
- GitHub disables scheduled workflows in a public repository after 60 days with no repository
  activity. If pings stop, check the Actions tab first.
- Before a live event, check the project is awake: open the production URL and sign in.

### 9.2 Upgrade paths

| When                                                | Action                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Running real events                                 | Move Supabase to the Pro plan. Pro projects are not paused. The plan is changed in the organisation's billing settings. No code change. |
| Charging for events, or any commercial use          | Move Vercel to Pro. Hobby is for non-commercial use only. Check the Vercel terms before you charge anyone.                              |
| A room needs more than 8 phones or more connections | Look at the Realtime limits in section 9.4 first. Free allows 200 concurrent connections.                                               |

### 9.3 Rotating keys

The publishable key can be rotated. The app keeps working with the new key once it is deployed.

1. In the Supabase dashboard, create a new publishable key on the API settings page.
2. In Vercel, update `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview.
3. Redeploy from Vercel. The key is read at build time, so an old build keeps the old key.
4. In GitHub, update the `SUPABASE_PUBLISHABLE_KEY` secret.
5. Run the keep-alive workflow by hand and check it is green.
6. Only then revoke the old key.

If a secret or service-role key ever leaks, revoke it at once. The app never uses one, so the fix is
to revoke it and check the repo and Vercel settings for a copy.

Changing the key needs no data change, because RLS does not depend on the key value.

### 9.4 Reading Realtime and Auth reports

Open the project's Realtime and Auth sections in the dashboard. Use them for two things: to check
connection and message counts during an event, and to find sign-in failures. Compare what you see
with the Free limits:

| Limit (Free)                 | Value     | What uses it                                             |
| ---------------------------- | --------- | -------------------------------------------------------- |
| Concurrent connections       | 200       | One stage, a few host views and up to 8 phones per event |
| Messages per second          | 100       | Presses, controls and the audience heartbeat             |
| Presence messages per second | 20        | Phones and host views joining and leaving                |
| Broadcast payload            | 256 KB    | The app keeps its own limit at 32 KB                     |
| Messages per month           | 2 million | Total over the month                                     |

The design (section 13) asks for a banner on the stage with the connection count when the limit is
hit. That banner is not built yet. Check the Realtime report if an event sees dropped phones.

For browser-side tracing, set `localStorage["gst:debug"] = "1"` in the browser's console and reload.
This turns on the app's debug logging.

### 9.5 Purging rooms

Rooms expire 12 hours after their last activity. Their phone memberships go with them.

- **Automatic.** When a host opens a room, `open_room` deletes expired rooms first.
- **Scheduled (optional).** If the pg_cron extension is enabled (Database, then Extensions), run
  this once in the SQL editor:
  `select cron.schedule('purge-expired-rooms', '17 * * * *', 'select public.purge_expired_rooms()');`
- **Manual purge of expired rooms.** In the SQL editor: `select public.purge_expired_rooms();`
- **End one room now.** `delete from public.rooms where code = 'BKDX';` (use the real code). Its
  members are deleted with it, and phones in that room cannot rejoin.

### 9.6 Rollback

- **App.** In the Vercel dashboard, open the Deployments page, choose the last good deployment, and
  promote it or roll back to it. Then fix the change on a branch.
- **Database.** Migrations have no down step. Fix forward: write a new migration in
  `supabase/migrations/` and apply it with `supabase db push`. Do not edit an applied migration.

### 9.7 Common errors

| What the user sees                                 | Likely cause and fix                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "Supabase is not configured" on the production URL | The `VITE_` variables were missing at build time. Add them in Vercel and redeploy.                          |
| The confirmation email links to `localhost`        | The Site URL is wrong. Set it to the production URL (step 3).                                               |
| The stage opens but shows no room code             | Migration 0002 is not applied, so `claim_director` does not exist. Apply it (section 2).                    |
| The stage says another stage is running this event | Another stage tab holds the event's lease. Close it, wait up to 30 seconds, then press "Reload this event". |
| Phone cannot join: room not found                  | Wrong code, or the room was idle for more than 12 hours. Check the code on the stage.                       |
| Phone says "Too many tries, wait a few minutes."   | Five failed joins in 10 minutes from one anonymous session. Wait a few minutes.                             |
| Every request fails and the dashboard says paused  | The project is paused. Restore it (section 9.1).                                                            |

## 10. Known limits

These are true of the code as it stands. The status of the release is in
[CHANGELOG.md](../CHANGELOG.md), under Known gaps.

- **Expired rooms are purged lazily.** Rooms are removed when a host opens a room or when the
  optional cron job runs. Until then an expired room keeps its member rows. New joins are refused
  after 12 hours, but phones that joined earlier keep read access to that room's stage topic.
- **Anonymous sessions can write large state.** A phone session (anonymous sign-in) can create an
  event and save a `state` document of any size. The 1 MB budget in the design is not enforced yet.
- **Join limits are per anonymous session.** The five-failures limit resets with a new anonymous
  session. The real cap on sign-ins comes from Supabase Auth, which this runbook does not configure.
- **Only Chromium is tested end to end.** There is no checklist yet for iOS Safari or Android Chrome.
- **The bundle-size check measures demo mode.** `e2e/bundle-size.spec.ts` loads the demo build. The
  Supabase build was measured by hand once: phone 147.0 KB gzipped against a 150 KB budget.
- **The SQL tests are not run in CI.** Run them by hand (section 2).
- **Keep-alive has never run** against the project (section 0).
- **Owner questions are open.** The puzzle game's name and scoring, and the rest of the list in
  `.ai/sdd/specs/001-cloud-rewrite/owner-questions.md`, await decisions. They do not block deployment.

## Live

Production: https://game-show-takeover-cloud.vercel.app (deployed 2026-11-04). Repo: https://github.com/robbsbodyshop-lab/game-show-takeover-cloud
