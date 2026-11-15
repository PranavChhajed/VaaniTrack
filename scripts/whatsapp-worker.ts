import { setTimeout as sleep } from "node:timers/promises";
import { accountDb, accountsEnabled } from "../src/lib/account/server";
import { whatsappEnabled } from "../src/lib/account/whatsapp";
import { processOne, deliverOne } from "../src/lib/account/whatsappWorker";
import { whatsappPipeline, sendWhatsApp } from "../src/lib/account/whatsappPipeline";

async function main() {
  if (!accountsEnabled() || !whatsappEnabled()) throw new Error("Account and WhatsApp beta flags must both be enabled for the worker");
  const db = accountDb();
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  // A prior process could have sent these before dying. Never resend them.
  await db`update account_private.outbox set state='unknown' where state='sending' and created_at<now()-interval '5 minutes'`;
  try {
    while (!stopping) {
      try {
        const worked = await processOne(db, whatsappPipeline);
        if (process.env.WHATSAPP_SEND_ENABLED === "1") await deliverOne(db, sendWhatsApp);
        if (!worked) await sleep(1000);
      } catch { console.error("Worker unavailable; durable jobs retained. Retrying in 10 seconds."); await sleep(10000); }
    }
  } finally { await db.end(); }
}
main().catch(() => { console.error("Worker could not start. Check beta configuration."); process.exitCode = 1; });
