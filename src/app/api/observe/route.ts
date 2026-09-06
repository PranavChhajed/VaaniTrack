import { NextResponse } from "next/server";
import {
  markTransactionDeleted,
  recordEvent,
  recordGate,
  upsertTransaction,
  validDeviceId,
  type GateOutcome,
  type UserAction,
} from "@/lib/observe";
import type { Transaction } from "@/lib/types";

/**
 * Where the client reports the things only the client knows.
 *
 * The gate decision and every user action happen in the browser, after both
 * API calls have returned — so they cannot be captured server-side and have to
 * be sent back deliberately.
 *
 * **This endpoint always answers 200.** Callers are fire-and-forget: a failure
 * to record diagnostics must never surface as an error in front of someone who
 * was only trying to log an expense.
 */

type Body =
  | {
      kind: "gate";
      captureId: string;
      rows: {
        idx: number;
        transactionId: string | null;
        extracted: unknown;
        outcome: GateOutcome;
        failed: string[];
      }[];
    }
  | {
      kind: "event";
      deviceId: string;
      action: UserAction;
      captureId?: string | null;
      transactionId?: string | null;
      before?: unknown;
      after?: unknown;
      changedFields?: string[];
    }
  | {
      kind: "transaction";
      deviceId: string;
      captureId?: string | null;
      transactions: Transaction[];
    }
  | { kind: "delete"; deviceId: string; id: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;

    switch (body.kind) {
      case "gate":
        await recordGate(body.captureId, body.rows);
        break;

      case "event":
        await recordEvent({
          captureId: body.captureId ?? null,
          transactionId: body.transactionId ?? null,
          deviceId: validDeviceId(body.deviceId),
          action: body.action,
          before: body.before,
          after: body.after,
          changedFields: body.changedFields,
        });
        break;

      case "transaction": {
        const deviceId = validDeviceId(body.deviceId);
        for (const t of body.transactions ?? []) {
          await upsertTransaction({
            id: t.id,
            deviceId,
            captureId: body.captureId ?? null,
            data: t,
            amount: t.amount?.value ?? null,
            date: t.date?.value ?? null,
          });
        }
        break;
      }

      case "delete":
        await markTransactionDeleted(body.id, validDeviceId(body.deviceId));
        break;
    }
  } catch {
    /* never surfaced — see the note above */
  }
  return NextResponse.json({ ok: true });
}
