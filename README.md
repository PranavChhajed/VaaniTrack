# VaaniTrack

Say what you spent. Check it. Done.

Voice-first expense capture. You speak an expense the way you'd text it to
yourself — *"250 lunch"* — and it becomes a structured transaction, with every
field showing whether it was heard, worked out, or filled from a default.
Nothing saves until you've looked at it.

Product thinking lives in [`PRD-VaaniTrack.md`](PRD-VaaniTrack.md).
Evidence in [`RESEARCH.md`](RESEARCH.md). Build log in
[`EXECUTION.md`](EXECUTION.md).

---

## Setup

```bash
npm install
```

Add a Groq API key to `.env.local` (free at
[console.groq.com](https://console.groq.com)):

```
GROQ_API_KEY=gsk_...
```

One key covers both stages — `whisper-large-v3` for transcription, and
`openai/gpt-oss-120b` for turning the transcript into a transaction.

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

---

## How it works

```
  speak
    │
    ▼
  whisper-large-v3            audio → text
    │
    ▼
  gpt-oss-120b                text → transaction + provenance
    │                          (never invents; leaves blanks blank)
    ▼
  review card                 you check the amount, then Save
    │
    ▼
  ledger                      localStorage
```

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

## Known limits

This is a two-day demo, deliberately scoped.

- **Cross-turn correction is not built.** Saying *"actually, the coffee was 180"*
  as a separate recording won't update anything — edit on the review card
  instead. Self-correction *within* one utterance does work: *"250, no wait,
  280 on lunch"* records ₹280 once.
- **No accounts, no sync, no database.** Everything is in `localStorage` on the
  device that recorded it.
- **Defaults are hard-coded** — UPI, today's date. No settings screen.
- **English only.**
- **The free Groq tier throttles.** Rapid-fire captures will hit a rate limit;
  the app says so and you wait a few seconds.
