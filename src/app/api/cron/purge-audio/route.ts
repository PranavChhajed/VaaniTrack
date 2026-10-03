import { NextResponse } from "next/server";
import {
  deleteStoredAudio,
  listExpiredAudio,
  markAudioPurged,
} from "@/lib/observe";

export const runtime = "nodejs"; // `postgres` requires it
export const maxDuration = 60;

/**
 * Deletes consented recordings past their 90-day retention window.
 *
 * The consent dialog promises this in as many words ("Recordings are deleted
 * after 90 days", AudioConsent.tsx), AUDIO_RETENTION_DAYS has been set and
 * audio_expires_at written onto every stored capture since
 * 002_transactions.sql — but nothing has ever read that column. This is that
 * reader. Scheduled daily by vercel.json; the first consented recording was
 * stored 6 September 2026, so the promise came due around 5 December 2026.
 *
 * Deliberately conservative: a capture row is never deleted, only its
 * audio_stored flag and the Storage object behind it. The transcript and
 * extraction history stay, because the 90-day promise is about the
 * recording, not the record of what was said.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const expired = await listExpiredAudio(200);
  let deleted = 0;
  let failed = 0;
  for (const row of expired) {
    if (await deleteStoredAudio(row.path)) {
      await markAudioPurged(row.id);
      deleted++;
    } else {
      failed++;
    }
  }

  console.log(
    `[purge-audio] ${deleted} deleted, ${failed} failed, ${expired.length} candidates`,
  );
  return NextResponse.json({ ok: true, deleted, failed, candidates: expired.length });
}
