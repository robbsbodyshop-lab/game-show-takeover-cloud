# Game Show Takeover

A live, host-run team game show played entirely in the browser and hosted in the cloud.
Family Feud and Wheel of Fortune full episodes, a Speed Round, a Plinko finale and an original
puzzle game, in a Super Nintendo + first-generation PlayStation style. Hosts sign up and run
events; teams play from their phones by scanning a QR code.

Status: rewrite in progress. Planning documents live in `.ai/` (steering, requirements,
design, tasks); rules of record in `docs/`.

## Development

```bash
npm install
npm run dev          # http://localhost:3000, demo mode (in-memory, no Supabase needed)
npm run validate     # typecheck, lint, format, unit tests, build (what CI runs)
npm run e2e          # Playwright flows
```

Copy `.env.example` to `.env.local` and fill the Supabase values to run against a real project.
