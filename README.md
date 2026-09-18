# VaaniTrack

Say what you spent. Check it. Done.

Voice-first expense capture. You speak an expense the way you'd text it to
yourself — *"250 lunch"* — and it becomes a structured transaction, with every
field showing whether it was heard, worked out, or filled from a default.
Nothing saves until you've looked at it.

**Start with [`CONTEXT.md`](CONTEXT.md)** — the whole product, architecture and
current state in one file. Product thinking lives in
[`PRD-VaaniTrack.md`](PRD-VaaniTrack.md), evidence in
[`RESEARCH.md`](RESEARCH.md), what the project runs on in
[`TechStack.md`](TechStack.md), and the build log in
[`EXECUTION.md`](EXECUTION.md).

---

## Setup

```bash
npm install
```

Copy [`.env.local.example`](.env.local.example) to `.env.local` and add a Groq
API key (free at [console.groq.com](https://console.groq.com)):

```
GROQ_API_KEY=gsk_...
```

One key covers both stages — `whisper-large-v3` for transcription, and
`openai/gpt-oss-120b` for turning the transcript into a transaction. **That is
the only variable capture needs.**

The rest of `.env.local.example` configures the observability layer and the
diagnostic portal. Leave them unset and the app behaves identically — capture
just runs unobserved, and `/portal` denies everyone. To turn them on you need a
Supabase project with the SQL in [`supabase/`](supabase/) applied in order
(`schema.sql`, then `002`, `003`, `004`) and a `captures` storage bucket:

```
DATABASE_URL=              # Supavisor TRANSACTION pooler, not the direct host
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=       # sb_secret_... — server only, bypasses RLS
PORTAL_PASSWORD=           # unset means /portal denies everyone
SAVE_CAPTURES=0            # local .captures/ files; defaults to ON if unset
```

---

## Running it on this machine

```bash
npm run dev
```

Open **http://localhost:3000**. The microphone works here because browsers
treat `localhost` as a secure origin.

---

## Running it on your phone

```bash
npm run dev:tunnel
```

It prints a **QR code** — point your phone camera at it — plus the URL, and
writes the same code to `phone-link.png` in case your terminal mangles the
block characters.

```
  ────────────────────────────────────────────────────
  Point your phone camera at this:

        [ QR code ]

  ...or open:  https://something-random.trycloudflare.com
  ...or open phone-link.png in this folder and scan it.
  ────────────────────────────────────────────────────
```

On the phone: tap **Say what you spent**, allow the microphone when asked,
speak, tap again to finish. A line under the button reports what was captured
and heard, so a failure says where it broke.

The phone does not need to be on the same Wi-Fi. Mobile data is fine.

> The URL is public while the tunnel runs. It's random and unlisted, and it
> dies when you stop the process — but anyone who has it can reach your app and
> spend your Groq quota. Don't post it anywhere.

### Why a tunnel, and not just HTTPS on the LAN

The microphone is the whole product, and browsers only expose `getUserMedia` in
a **secure context** — HTTPS with a certificate the browser trusts, or
`localhost`.

Serving HTTPS from your laptop with a self-signed certificate is not enough.
**Chrome does not treat an origin with a failed certificate as secure even
after you tap through the warning.** You get the page; you never get the
microphone. That is the wall you hit if the page loads on your phone but the
mic refuses to open.

The tunnel avoids it entirely: your phone talks to Cloudflare over a
certificate it already trusts, and Cloudflare forwards to your machine. No
certificate to install, no interstitial, no firewall rules.

### The LAN alternative

```bash
npm run dev:phone
```

Issues a certificate for your current LAN IP and prints `https://192.168.1.12:3000`.
Keeps everything on your own network — but you'll hit the Chrome problem above
unless you install the mkcert root CA on the phone
(`C:\Users\<you>\AppData\Local\mkcert\rootCA.pem`). Use the tunnel unless you
specifically need to stay off the internet.

Two things that bite on this path:

- **Windows Defender Firewall** prompts the first time Node binds to the
  network. Tick **Private networks** and allow. Dismissing it blocks the phone
  from reaching the laptop at all.
- **Same Wi-Fi required**, and router "client isolation" or a guest network
  will block it.

---

## Scripts

| | |
|---|---|
| `npm run dev` | http on localhost. Fine on this machine; mic won't work from a phone. |
| `npm run dev:tunnel` | **Public URL with a trusted certificate. Use this for phone testing.** |
| `npm run dev:phone` | https with a certificate for your LAN IP. Stays off the internet, but see the Chrome caveat above. |
| `npm run dev:https` | https via Next's own cert (localhost only). Fallback. |
| `npm run build` | Production build |
| `node --experimental-strip-types scripts/journal.test.ts` | The data-layer test suite. No framework, no build step. |
| `node --env-file=.env.local --experimental-strip-types scripts/observe.smoke.ts` | Writes one full pipeline's worth of rows to Supabase, reads them back, deletes them. |
| `start-vaanitrack.bat` | Windows one-click: clears stale processes, checks deps and the key, builds, tunnels. |

---

## How it works

```
  speak
    │
    ▼
  level meter                 is there actually sound in this? (dBFS)
    │                          a take under −55 dBFS is refused on the device
    ▼
  whisper-large-v3            audio → text
    │                          stock hallucinations rejected by denylist
    ▼
  gpt-oss-120b                text → transaction + provenance
    │                          (never invents; leaves blanks blank)
    ▼
  confidence gate             four conditions; all must hold to save silently
    │
    ▼
  review card                 you check the amount, then Save
    │
    ▼
  journal                     localStorage, mirrored to Postgres if configured
```

Every stage above writes a row describing what it did, so a wrong expense can
be traced to the stage that produced it rather than guessed at. `/portal` is
where that is read back.

**Why the review step exists:** currency amounts are the single worst thing
speech recognition does — 36.3% accuracy at baseline, the lowest of any numeric
category measured. The amount is also the one field that must never be wrong.
Showing every transaction before it commits is what makes that survivable.
See [`RESEARCH.md`](RESEARCH.md) §1.1.

**Provenance.** Every field records where its value came from — *said*,
*inferred*, *default*, or *unknown*. Values the system worked out rather than
heard are marked with a dotted underline on the review card. A missing category
stays blank rather than being guessed.

---

## The other pages

| Route | What it is |
|---|---|
| `/` | Capture. Today's transactions only. |
| `/journal` | The record — all populated days, month subtotals, edit and delete. |
| `/portal` | **Diagnostic portal.** Every capture, its pipeline stages, and a heuristic naming the likely point of failure. Password-gated; denies everyone when `PORTAL_PASSWORD` is unset. |
| `/diag` | General diagnostics. |
| `/diag/mic` | **Microphone signal test.** Runs the same utterance through three `getUserMedia` configurations and prints the dBFS that actually arrived. Built because Android routes capture through the platform voice path on some handsets, and whether that path works is a property of the handset. |

---

## Known limits

This is a two-day demo, deliberately scoped.

- **Cross-turn correction is not built.** Saying *"actually, the coffee was 180"*
  as a separate recording won't update anything — edit on the review card
  instead. Self-correction *within* one utterance does work: *"250, no wait,
  280 on lunch"* records ₹280 once.
- **No accounts, no cross-device sync.** `localStorage` on the device that
  recorded it is the working copy. When Supabase is configured, transactions
  also mirror to Postgres keyed by an anonymous per-browser device id — that is
  durability, not sync: a second device is a different id and sees nothing.
  Clearing site data still resets the id and orphans the mirrored rows.
- **Defaults are hard-coded** — UPI, today's date. No settings screen.
- **English only.**
- **The free Groq tier throttles.** Rapid-fire captures will hit a rate limit;
  the app says so and you wait a few seconds.
- **Recordings are kept only if you say yes.** One question, asked once before
  the first recording, with no pre-ticked box. Answering no is not a degraded
  mode — everything works identically, the audio just isn't retained. Consented
  clips expire after 90 days. The pipeline metrics are recorded either way.
- **The microphone can lie.** Some Android handsets deliver digital zeros for
  up to 1.4 seconds after granting access, and Opus encodes that silence at the
  same bitrate as speech, so a dead recording looks healthy by every measure
  except the signal itself. The recorder now waits for the level meter to see
  sound before it says "Tap to finish". If capture still comes back empty, run
  `/diag/mic`.
