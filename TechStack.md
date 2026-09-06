# VaaniTrack — Tech Stack

**The complete, current technology inventory.** Every dependency, service, model and tool the project uses, and why each was chosen.

> **Maintenance rule:** whenever a new technology, service, library or model is introduced, add it here in the same turn. This file is meant to always answer "what are we actually running?" without reading `package.json` or grepping the codebase.

Last updated: **6 September 2026** · Status legend: **IN USE** · **PLANNED** · **REMOVED**

---

## 1. At a glance

| Layer | Technology | Status |
|---|---|---|
| Framework | Next.js 16.3.4 (App Router, Turbopack) | IN USE |
| UI runtime | React 19.2.8 | IN USE |
| Language | TypeScript 5 | IN USE |
| Styling | Tailwind CSS v4 | IN USE |
| Speech → text | Groq · `whisper-large-v3` | IN USE |
| Text → transaction | Groq · `openai/gpt-oss-120b` | IN USE |
| Client storage | Browser `localStorage` | IN USE |
| Server storage | Supabase (Postgres + Storage) | PLANNED — Phase C |
| Hosting | Vercel | PLANNED — Phase C6 |
| Phone testing | Cloudflare quick tunnel | IN USE (to be retired by hosting) |
| Version control | Git + GitHub (private) | IN USE |

---

## 2. Core framework

### Next.js `16.3.4` — IN USE

App Router with Turbopack. Chosen because the product needs both a client-side UI (microphone, local state) and server-side API routes (to keep the Groq API key off the device) in one deployable unit.

> **Note:** this is a recent Next.js version whose APIs and conventions may differ from older documentation. The repo's `AGENTS.md` instructs reading `node_modules/next/dist/docs/` before writing framework code.

**Routes**

| Route | Type | Purpose |
|---|---|---|
| `/` | Static | Capture screen |
| `/journal` | Static | The transaction record |
| `/diag` | Static | On-device diagnostics (mic, codecs) |
| `/api/transcribe` | Dynamic | Stage 1 — audio → text |
| `/api/extract` | Dynamic | Stage 2 — text → transaction |
| `/portal` | Dynamic | PLANNED — diagnostic portal |

### React `19.2.8` — IN USE

All interactive screens are client components (`"use client"`). No server components beyond the root layout, because effectively everything on screen depends on the microphone or on browser-local state.

### TypeScript `5` — IN USE

Strict typing throughout. The `Field<T>` / `Provenance` model is the reason: provenance tracking only holds if the compiler enforces it. Verified with `npx tsc --noEmit`.

---

## 3. Styling and design

### Tailwind CSS `v4` — IN USE

Via `@tailwindcss/postcss`. **v4 uses CSS-first configuration** — there is no `tailwind.config.js`. All design tokens live in `@theme` inside `src/app/globals.css`.

Custom tokens: `--color-paper`, `--color-vast-ink`, `--color-forest-ink`, `--color-mint-whisper`, `--radius-chamber`, the `--text-*` scale, and the `.rise` / `.sheet-rise` / `.veil-in` animations.

### Fonts — IN USE

Loaded through `next/font/google`, self-hosted at build time (no runtime request to Google):

- **EB Garamond** (400) — display and editorial headings
- **Figtree** (400–700) — body, UI, labels

---

## 4. AI / ML services

### Groq — IN USE

Single API key (`GROQ_API_KEY`) covers both models. Chosen for inference speed, which matters because the user is waiting with their phone in their hand.

#### `whisper-large-v3` — transcription

Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`

| Setting | Value | Reason |
|---|---|---|
| `response_format` | `verbose_json` | Needed for per-segment `avg_logprob` and `no_speech_prob` |
| `temperature` | `0` | Determinism; this is transcription, not generation |
| `prompt` | `"Amounts in Indian rupees: 250, 120, 1500, 300."` | Chosen by experiment — stops the model formatting "two fifty" as `$2.50` |

Chosen because it scored best in testing at **11.2% WER** on real-world use cases.

#### `openai/gpt-oss-120b` — extraction

Endpoint: `https://api.groq.com/openai/v1/chat/completions` · overridable via `GROQ_MODEL`.

Converts a transcript into structured transactions with per-field provenance. **This prompt is the product** — it is what lifts currency-amount accuracy from ~36% (raw ASR) to ~96% (cascade).

---

## 5. Browser APIs

| API | Use | Constraint |
|---|---|---|
| `MediaRecorder` | Audio capture (`audio/webm;codecs=opus`) | Requires a **secure context** — HTTPS or localhost |
| `getUserMedia` | Microphone access | Blocked on invalid certificates, even after clicking through |
| `AudioContext` | Live level metering for the waveform button | — |
| `localStorage` | Transaction persistence, key `vaanitrack.transactions` | Per-browser, per-device, no sync |
| `crypto.randomUUID()` | Transaction IDs | Secure-context only |

**The secure-context requirement is why a tunnel exists.** A self-signed certificate is not enough: Chrome refuses `getUserMedia` on an origin whose certificate failed validation, even after the user accepts the warning.

---

## 6. Persistence

### Browser `localStorage` — IN USE

Single key, `vaanitrack.transactions`, holding a JSON array of `Transaction`. Reads and writes are wrapped in `try/catch` — storage can be unavailable in private mode or with site data blocked, and losing history beats crashing.

**Known limitation:** per-browser and per-device. Clearing browser data destroys it; phone and laptop keep entirely separate records; nothing syncs.

### Local capture files — IN USE, being replaced

`.captures/` holds a `.webm` and a `.json` per capture (verdict, transcript, confidence, `no_speech_prob`, full Whisper segments). Gitignored.

Controlled by `SAVE_CAPTURES`. **Being changed from default-on to consent-gated**, and being migrated to Supabase — local disk writes fail silently on Vercel's ephemeral filesystem.

### Supabase — PLANNED (Phase C)

**Postgres** for the observability tables (`captures`, `capture_transactions`, `capture_events`) and durable transaction storage.
**Supabase Storage** for consent-gated audio blobs.

Chosen because it provides both the database and the blob storage behind one service and one client library, avoiding a second vendor purely for audio.

**Client library:** `@supabase/supabase-js` — PLANNED

| Env var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Full access — must never reach the client bundle |

---

## 7. Hosting and networking

### Vercel — PLANNED (Phase C6)

Native Next.js hosting, permanent HTTPS URL, auto-deploy on push. Replaces the tunnel entirely.

**Consequence to remember:** the filesystem is ephemeral and read-only. Any `fs.writeFile` — including the current `.captures/` logic — silently no-ops in production.

### Cloudflare quick tunnel (`cloudflared ^0.7.3`) — IN USE, to be retired

Gives a public HTTPS URL with a genuinely trusted certificate so the microphone works on a phone.

**Two known failure modes, both hit in practice:**
1. The hostname is random per run, and some ISP resolvers (Airtel observed) return `NXDOMAIN` for it — the link then fails on that whole network while appearing fine elsewhere
2. The tunnel can die into a permanent reconnect loop while the process stays alive, so nothing looks wrong but the DNS record is withdrawn

Deploying to Vercel removes this entire class of problem.

### `qrcode ^1.5.4` — IN USE

Renders the tunnel URL as a scannable QR in the terminal and to `phone-link.png`. Retired alongside the tunnel.

---

## 8. Tooling

| Tool | Version | Use |
|---|---|---|
| ESLint | `^9` + `eslint-config-next 16.3.4` | Linting |
| Node type-stripping | `node --experimental-strip-types` | Runs the TypeScript test file with **no test framework and no build step** |
| Git + GitHub | — | `PranavChhajed/VaaniTrack`, private |

### Testing — IN USE

`scripts/journal.test.ts` — **34 assertions, zero dependencies.** A hand-rolled `check(name, got, want)` comparing JSON. Deliberately not Jest or Vitest: the data layer's rules (day grouping, time ordering, month boundaries) need asserting, not a framework.

`scripts/` is excluded in `tsconfig.json` so `tsc` doesn't parse the `.ts` import extensions that Node's type-stripping requires.

### `start-vaanitrack.bat` — IN USE

Windows one-click startup: clears stale processes, verifies dependencies and the API key, then builds and tunnels. Auto-selects phone mode after a 10-second prompt.

---

## 9. Everything the project depends on

**Runtime** — `next@16.3.4`, `react@19.2.8`, `react-dom@19.2.8`

**Development** — `typescript@^5`, `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `eslint@^9`, `eslint-config-next@16.3.4`, `cloudflared@^0.7.3`, `qrcode@^1.5.4`, `@types/node@^20`, `@types/react@^19`, `@types/react-dom@^19`

**Planned** — `@supabase/supabase-js`

Three runtime dependencies total. That is deliberate: fewer moving parts, faster installs, less to break.

### Environment variables

| Variable | Status | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Required | Both models |
| `GROQ_MODEL` | Optional | Override the extraction model |
| `SAVE_CAPTURES` | Optional | `0` disables capture logging (becoming consent-gated) |
| `NEXT_PUBLIC_SUPABASE_URL` | PLANNED | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | PLANNED | Server-side Supabase access |

---

## 10. Deliberately not used

| Not used | Why |
|---|---|
| A component library (MUI, shadcn) | The design language is specific and editorial; a library would fight it |
| A state manager (Redux, Zustand) | Two screens and one array of transactions — `useState` is sufficient |
| A test framework (Jest, Vitest) | A 34-assertion data-layer suite doesn't need one |
| An ORM (Prisma, Drizzle) | The schema is three tables; raw SQL is clearer and adds no build step |
| Auth (NextAuth, Clerk) | No accounts by design. Observability uses an anonymous per-browser device ID |
| A separate analytics tool | The portal answers "why did this expense go wrong", not "how many DAUs" |
| Fine-tuned ASR | Would reach ~98.5% on amounts, but the cascade reaches ~95.6% with no training pipeline. Revisit only with real failure data |

---

## 11. Change log

| Date | Change |
|---|---|
| 2026-09-06 | File created. Supabase and Vercel recorded as PLANNED for Phase C |
