#!/usr/bin/env node
/**
 * Starts the dev server over HTTPS with a certificate valid for this machine's
 * current LAN address.
 *
 * Why this exists: browsers expose getUserMedia only in a secure context —
 * HTTPS, or a localhost origin. Testing on a phone means hitting the LAN IP,
 * which is neither, so the microphone is silently unavailable. Next's built-in
 * --experimental-https issues a cert for localhost only, which leaves the phone
 * with a certificate warning on every load.
 *
 * This reissues the cert to cover the current LAN IP, so the phone gets a
 * clean HTTPS origin and a working microphone. The IP is resolved at start
 * time because DHCP reassigns it.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { networkInterfaces, homedir } from "node:os";
import { join } from "node:path";

const CERT_DIR = "certificates";
const CERT = join(CERT_DIR, "localhost.pem");
const KEY = join(CERT_DIR, "localhost-key.pem");

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

function findMkcert() {
  // Next downloads mkcert here the first time --experimental-https runs.
  const dir = join(homedir(), "AppData", "Local", "mkcert");
  if (existsSync(dir)) {
    const exe = readdirSync(dir).find((f) => /^mkcert.*\.exe$/i.test(f));
    if (exe) return join(dir, exe);
  }
  // On macOS/Linux, or if installed via a package manager.
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["mkcert"], {
    encoding: "utf8",
  });
  if (which.status === 0) return which.stdout.trim().split(/\r?\n/)[0];
  return null;
}

const ip = lanAddress();
const mkcert = findMkcert();

if (!ip) {
  console.log("\n  No LAN address found — are you connected to Wi-Fi?");
  console.log("  Falling back to Next's own certificate (localhost only).\n");
}

let useOwnCert = false;

if (ip && mkcert) {
  mkdirSync(CERT_DIR, { recursive: true });
  const result = spawnSync(
    mkcert,
    ["-cert-file", CERT, "-key-file", KEY, "localhost", "127.0.0.1", "::1", ip],
    { stdio: "inherit" },
  );
  useOwnCert = result.status === 0 && existsSync(CERT) && existsSync(KEY);
  if (!useOwnCert) {
    console.log("\n  Could not reissue the certificate; using Next's default.\n");
  }
} else if (ip && !mkcert) {
  console.log("\n  mkcert not found yet. Run `npm run dev:https` once to let");
  console.log("  Next download it, then run this again for a LAN certificate.\n");
}

const args = ["dev", "--experimental-https", "--hostname", "0.0.0.0"];
if (useOwnCert) {
  args.push("--experimental-https-key", KEY, "--experimental-https-cert", CERT);
}

if (ip) {
  const line = "─".repeat(46);
  console.log(`\n  ${line}`);
  console.log(`  On your phone, open:   https://${ip}:3000`);
  console.log(`  On this machine:       https://localhost:3000`);
  console.log(`  ${line}`);
  console.log(
    useOwnCert
      ? "  Certificate covers this IP. Phone may still warn once\n" +
          "  because the root CA is not installed there — tap through\n" +
          "  Advanced → Proceed. The mic works either way.\n"
      : "  Certificate is localhost-only, so the phone will warn.\n" +
          "  Tap Advanced → Proceed; the mic still works over https.\n",
  );
}

spawn("npx", ["next", ...args], { stdio: "inherit", shell: true });
