/**
 * The plain-expense reader against the real record.
 *
 *   npx tsx --env-file=.env.local scripts/quick-real.ts
 *
 * Takes every accepted spoken capture's transcript, asks `quickParse` for its
 * answer, and compares it with what the model returned for the same words and
 * with whether the person went on to change or delete the entry. A transcript
 * the reader takes and answers differently from a model whose answer was kept
 * is a wrong accept.
 */
import postgres from "postgres";
import { quickParse } from "../src/lib/quick.ts";
import type { PaymentMethod } from "../src/lib/types.ts";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });

(async () => {
  const rows = await sql`
    select c.id, c.created_at, c.transcript, c.extract_raw,
      (select array_agg(distinct e.action) from capture_events e where e.capture_id = c.id) as actions
    from captures c
    where c.source = 'voice' and c.asr_verdict = 'accepted' and c.transcript is not null
    order by c.created_at`;
  let taken = 0, agree = 0, differ = 0, changedByPerson = 0;
  const lines: string[] = [];
  for (const r of rows) {
    const day = new Date(new Date(r.created_at).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10); // an Indian day
    const quick = quickParse(r.transcript, day, "UPI" as PaymentMethod);
    if (!quick) continue;
    taken++;
    const model = (r.extract_raw?.transactions ?? []) as { amount?: number; description?: string; paymentMethod?: string }[];
    const q = quick.transactions[0];
    const same = model.length === 1 && model[0].amount === q.amount;
    const touched = (r.actions ?? []).some((a: string) => ["edited", "deleted", "undone"].includes(a));
    if (same) agree++; else differ++;
    if (touched) changedByPerson++;
    if (!same) lines.push(`DIFFERS  "${r.transcript}"  reader ${q.amount}/${q.description}  model ${JSON.stringify(model.map((m) => [m.amount, m.description]))}  ${touched ? "(person changed it)" : ""}`);
  }
  console.log(`${rows.length} accepted spoken captures; the reader takes ${taken} (${Math.round((100 * taken) / rows.length)}%)`);
  console.log(`agrees with the model on the amount: ${agree}; differs: ${differ}; of the ones it took, the person later changed ${changedByPerson}`);
  for (const l of lines) console.log(l);
  await sql.end();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
