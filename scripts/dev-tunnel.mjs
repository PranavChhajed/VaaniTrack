#!/usr/bin/env node
/**
 * Runs the dev server behind a Cloudflare quick tunnel, giving a public URL
 * with a genuinely trusted certificate.
 *
 * Why this exists, when dev:phone already serves HTTPS:
 *
 * Chrome does not treat an origin whose certificate failed validation as a
 * secure context, even after the user taps through the interstitial. The page
 * loads, but powerful features stay blocked — and getUserMedia is one of them.
 * So a self-signed certificate gets you the page on a phone and never gets you
 * the microphone, unless the signing CA is installed on the phone itself.
 *
 * A tunnel sidesteps that: the phone talks to Cloudflare over a certificate it
 * already trusts, and Cloudflare talks to this machine. No certificate to
 * install, no interstitial, and the microphone works.
 *
 * Trade-off: the URL is public while the tunnel is open. It is random and
 * unlisted, and it dies when this process does, but treat it as public.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

function cloudflaredPath() {
  try {
    const { bin } = require("cloudflared");
    if (bin && existsSync(bin)) return bin;
  } catch {
    /* fall through */
  }
  const local = "node_modules/cloudflared/bin/cloudflared.exe";
  return existsSync(local) ? local : "cloudflared";
}

// Production mode by default for phone testing. `next dev` ships an HMR
// WebSocket and unbundled chunks; over a tunnel, on a phone, that is a
// fragile combination — and a hydration failure there looks exactly like
// "the buttons do nothing". `next start` serves static, pre-built chunks.
const useDev = process.argv.includes("--dev");
const next = spawn("npx", ["next", useDev ? "dev" : "start"], {
  stdio: "inherit",
  shell: true,
});
console.log(`\n  serving: next ${useDev ? "dev" : "start (production build)"}`);

let tunnel;
let printed = false;

// Give Next a moment to bind the port before Cloudflare starts probing it.
const startTunnel = setTimeout(() => {
  tunnel = spawn(cloudflaredPath(), ["tunnel", "--url", "http://localhost:3000"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const scan = (chunk) => {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !printed) {
      printed = true;
      const url = match[0];
      const line = "─".repeat(52);

      // The URL is long and random; typing it on a phone is miserable.
      // Print a QR to scan with the camera, and drop a PNG next to it in
      // case the terminal mangles the block characters.
      const show = (qr) => {
        console.log(`\n  ${line}`);
        console.log(`  Point your phone camera at this:\n`);
        if (qr) console.log(qr);
        console.log(`  ...or open:  ${url}`);
        console.log(`  ...or open phone-link.png in this folder and scan it.\n`);
        console.log(`  Real certificate, no warning, microphone works.`);
        console.log(`  The link dies when you stop this process.`);
        console.log(`  ${line}\n`);
      };

      // cloudflared prints the hostname before Cloudflare edge DNS has
      // necessarily published it. Handing that URL over immediately produced a
      // link that simply did not resolve on the phone, which is indisputable
      // from the far end and looks like the app being broken. Wait until the
      // tunnel actually answers before saying it is ready. Budget three
      // minutes: a 60s budget timed out on a tunnel that came up at ~90s.
      const ready = async () => {
        for (let attempt = 1; attempt <= 90; attempt++) {
          try {
            const res = await fetch(url, {
              method: "HEAD",
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) return true;
          } catch {
            /* not up yet */
          }
          if (attempt === 1) process.stdout.write("\n  waiting for the tunnel to resolve");
          process.stdout.write(".");
          await new Promise((r) => setTimeout(r, 2000));
        }
        return false;
      };

      ready().then(async (live) => {
        if (!live) {
          console.log(
            `\n\n  Tunnel never answered at ${url}\n` +
              `  Stop this and run it again - quick tunnels sometimes fail to publish.\n`,
          );
          return;
        }
        let qr = null;
        try {
          const { default: QR } = await import("qrcode");
          await QR.toFile("phone-link.png", url, { width: 520, margin: 2 }).catch(() => {});
          qr = await QR.toString(url, { type: "terminal", small: true });
        } catch {
          /* QR is a convenience, not a requirement */
        }
        show(qr);
      });
    }
    if (/ERR|error/i.test(text) && !printed) process.stderr.write(text);
  };

  tunnel.stdout.on("data", scan);
  tunnel.stderr.on("data", scan);

  tunnel.on("error", (err) => {
    console.error(`\n  Could not start cloudflared: ${err.message}`);
    console.error(`  Falling back: use "npm run dev:phone" instead.\n`);
  });
}, 4000);

const shutdown = () => {
  clearTimeout(startTunnel);
  tunnel?.kill();
  next.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", shutdown);
