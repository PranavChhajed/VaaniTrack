/** Shared web/WhatsApp decision rule. A fast result is not evidence of correctness. */
export function gateFailures(row: { amount: number | null; amountProvenance: string; needsConfirmation: boolean }, heardWell: boolean, reviewAll = false): string[] {
  const failed: string[] = [];
  if (!heardWell) failed.push("audio_unclear");
  if (row.needsConfirmation) failed.push("extractor_flagged_ambiguous");
  if (row.amount === null) failed.push("amount_missing");
  else if (row.amountProvenance !== "said") failed.push("amount_not_said");
  if (reviewAll) failed.push("review_mode");
  return failed;
}
