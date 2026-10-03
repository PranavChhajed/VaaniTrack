import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Access control for the diagnostic portal.
 *
 * The portal shows transcripts and amounts: a readable record of what someone
 * spent and said. That is the most sensitive surface in the product, and it is
 * the one page that must not be reachable by anyone who happens to find the
 * URL.
 *
 * Deliberately not an auth system. One operator, one password from the
 * environment, one cookie. If VaaniTrack ever gains real accounts this gets
 * replaced wholesale rather than extended.
 */

export const PORTAL_COOKIE = "vt_portal";

function token(password: string): string {
  return createHash("sha256").update(`vaanitrack:${password}`).digest("hex");
}

/** The value a correct password produces. Null when no password is configured. */
export function expectedToken(): string | null {
  const password = process.env.PORTAL_PASSWORD;
  return password ? token(password) : null;
}

export function tokenFor(password: string): string {
  return token(password);
}

/** Constant-time comparison against a hex digest of known length. */
function safeEqual(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Whether a submitted password is the configured one.
 *
 * Timing-safe for the same reason isAuthorised() below is: a `!==` on the
 * token strings leaks how many leading hex characters matched through
 * response latency, same as a raw password compare would.
 */
export function verifyPassword(password: string): boolean {
  const expected = expectedToken();
  if (!expected) return false;
  return safeEqual(tokenFor(password), expected);
}

/**
 * Whether this request may see the portal.
 *
 * An unset PORTAL_PASSWORD denies everyone rather than letting the page fall
 * open: a missing environment variable in production must fail closed.
 */
export async function isAuthorised(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false;
  const given = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!given) return false;
  return safeEqual(given, expected);
}
