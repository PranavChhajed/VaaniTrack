import { NextResponse } from "next/server";
import { expectedToken, tokenFor, PORTAL_COOKIE } from "@/lib/portalAuth";

/** Exchange the portal password for a session cookie. */
export async function POST(request: Request) {
  const expected = expectedToken();
  if (!expected) {
    return NextResponse.json(
      { error: "No portal password is configured on the server." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (tokenFor(password) !== expected) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
