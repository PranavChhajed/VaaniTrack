import { NextResponse } from "next/server";
import { isAuthorised } from "@/lib/portalAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Storage for the voice lab's recordings. Behind the portal password.
 *
 * The lab is how the labelled test set gets made: a person reads a written line
 * aloud in a stated condition, and the recording is filed under that line's id.
 * `scripts/eval.ts` later runs those recordings through the real pipeline and
 * scores them against what the line was supposed to say.
 *
 * They go in the same private bucket as consented captures, under `lab/`, so no
 * new storage is needed. Nothing here touches the capture tables, and the audio
 * purge only ever deletes paths that a capture row points at, so lab files are
 * kept until someone deletes them.
 *
 * GET lists what is stored (so the page can show what is already recorded),
 * POST stores one take, DELETE removes one.
 */

const BUCKET = "captures";
const PREFIX = "lab";

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") ?? null;
const key = () => process.env.SUPABASE_SECRET_KEY ?? null;

/** `<session>/<line id>__<condition>__<take>__<variant>.<ext>`, nothing else is accepted. */
const SESSION = /^[a-z0-9-]{1,40}$/;
const LINE = /^[a-z0-9]{1,8}$/;
const CONDITION = /^(quiet|noisy|moving|fast|mumbled)$/;
const VARIANT = /^(plain|boost)$/;

function extFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

const unauthorised = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });
const unconfigured = () => NextResponse.json({ error: "Storage is not configured." }, { status: 500 });

export async function GET() {
  if (!(await isAuthorised())) return unauthorised();
  const url = base(), secret = key();
  if (!url || !secret) return unconfigured();

  const names: string[] = [];
  // One level of folders (sessions), then the takes inside each.
  const list = async (prefix: string) => {
    const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    return res.ok ? ((await res.json()) as { name: string; id: string | null }[]) : [];
  };
  for (const entry of await list(PREFIX)) {
    if (entry.id === null) {
      for (const take of await list(`${PREFIX}/${entry.name}`)) names.push(`${entry.name}/${take.name}`);
    }
  }
  return NextResponse.json({ takes: names });
}

export async function POST(request: Request) {
  if (!(await isAuthorised())) return unauthorised();
  const url = base(), secret = key();
  if (!url || !secret) return unconfigured();

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const session = String(form?.get("session") ?? "");
  const line = String(form?.get("line") ?? "");
  const condition = String(form?.get("condition") ?? "");
  const take = Number(form?.get("take") ?? 1);
  const variant = String(form?.get("variant") ?? "plain");
  if (!(audio instanceof File) || audio.size < 800) {
    return NextResponse.json({ error: "No audio." }, { status: 400 });
  }
  if (!SESSION.test(session) || !LINE.test(line) || !CONDITION.test(condition) || !VARIANT.test(variant) || !(take >= 1 && take <= 9)) {
    return NextResponse.json({ error: "Bad line, session, condition or variant." }, { status: 400 });
  }

  const mime = (audio.type || "audio/webm").split(";")[0].trim();
  const path = `${PREFIX}/${session}/${line}__${condition}__${take}__${variant}.${extFor(mime)}`;
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": mime, "x-upsert": "true" },
    body: await audio.arrayBuffer(),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Storage refused it (${res.status}).`, detail: (await res.text()).slice(0, 200) }, { status: 502 });
  }
  return NextResponse.json({ ok: true, path });
}

export async function DELETE(request: Request) {
  if (!(await isAuthorised())) return unauthorised();
  const url = base(), secret = key();
  if (!url || !secret) return unconfigured();
  const { path } = (await request.json().catch(() => ({}))) as { path?: string };
  if (!path || !new RegExp(`^[a-z0-9-]{1,40}/[a-z0-9]{1,8}__[a-z]+__[1-9]__[a-z]+\\.(webm|mp4|ogg)$`).test(path)) {
    return NextResponse.json({ error: "Bad path." }, { status: 400 });
  }
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${PREFIX}/${path}`, {
    method: "DELETE",
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
}
