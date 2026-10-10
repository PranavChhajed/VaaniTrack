import { NextResponse } from "next/server";
import { eraseDeviceData, validDeviceId, type EraseScope } from "@/lib/observe";

export const runtime = "nodejs"; // `postgres` requires it
export const maxDuration = 30;

/**
 * "Delete my recordings" and "Delete everything", from the You screen.
 *
 * Unlike `/api/observe`, which always answers 200 because nobody is waiting
 * on it, this one answers truthfully. The person is looking at a button that
 * says it will make something disappear, and a 200 for a delete that did not
 * happen would be the worst thing this route could say.
 */
export async function POST(request: Request) {
  let deviceId: string | null = null;
  let scope: EraseScope | null = null;
  try {
    const body = (await request.json()) as { deviceId?: unknown; scope?: unknown };
    deviceId = validDeviceId(body.deviceId);
    if (body.scope === "recordings" || body.scope === "everything") {
      scope = body.scope;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (!deviceId || !scope) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await eraseDeviceData(deviceId, scope);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
