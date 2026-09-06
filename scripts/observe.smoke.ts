/**
 * Smoke test for the observability layer. Writes one full pipeline's worth of
 * rows, reads them back, then removes them.
 *
 * Run: node --env-file=.env.local --experimental-strip-types scripts/observe.smoke.ts
 */
import {
  recordCapture,
  recordExtraction,
  recordGate,
  recordEvent,
  getCapture,
  listCaptures,
  validDeviceId,
} from "../src/lib/observe.ts";

const device = "11111111-2222-3333-4444-555555555555";
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
};

check("validDeviceId accepts a uuid", validDeviceId(device) === device);
check("validDeviceId rejects junk", validDeviceId("not-a-uuid") === null);

const captureId = await recordCapture({
  deviceId: device,
  source: "voice",
  audioMime: "audio/webm;codecs=opus",
  audioBytes: 67771,
  audioMs: 4300,
  asrModel: "whisper-large-v3",
  transcript: "spent two fifty on lunch",
  asrVerdict: "accepted",
  avgLogprob: -0.274,
  noSpeechProb: 0.021,
});
check("capture row created", !!captureId, captureId ?? "(null)");
if (!captureId) process.exit(1);

await recordExtraction(captureId, {
  model: "openai/gpt-oss-120b",
  raw: { transactions: [{ amount: 2050, description: "lunch" }] },
  ms: 812,
});

await recordGate(captureId, [
  {
    idx: 0,
    transactionId: crypto.randomUUID(),
    extracted: { amount: 2050, amountProvenance: "said", description: "lunch" },
    outcome: "auto_saved",
    failed: [],
  },
  {
    idx: 1,
    transactionId: null,
    extracted: { amount: null, amountProvenance: "unknown" },
    outcome: "review",
    failed: ["amount_missing", "amount_not_said"],
  },
]);

await recordEvent({
  captureId,
  deviceId: device,
  action: "undone",
  before: { amount: 2050 },
  after: null,
});

const full = await getCapture(captureId);
check("capture reads back", !!full);
check("transcript preserved", full?.capture.transcript === "spent two fifty on lunch");
check("negative avg_logprob stored", Math.abs((full?.capture.avg_logprob ?? 0) + 0.274) < 0.001,
  `got ${full?.capture.avg_logprob}`);
check("extraction attached", full?.capture.extract_model === "openai/gpt-oss-120b");
check("raw model output kept", !!full?.capture.extract_raw);
check("one capture -> two transactions", full?.transactions.length === 2,
  `got ${full?.transactions.length}`);
check("gate_failed names the conditions",
  JSON.stringify(full?.transactions[1].gate_failed) === JSON.stringify(["amount_missing","amount_not_said"]),
  JSON.stringify(full?.transactions[1].gate_failed));
check("undo event recorded", full?.events.length === 1 && full?.events[0].action === "undone");
check("before_state preserved", !!full?.events[0].before_state);

const list = await listCaptures(5);
check("listCaptures returns rows", list.length > 0, `${list.length} rows`);

// clean up the test data
const { default: postgres } = await import("postgres");
const s = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
await s`delete from captures where device_id = ${device}`;
await s.end();
console.log("\ncleaned up test rows");

console.log(failures === 0 ? "\nall passed\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
