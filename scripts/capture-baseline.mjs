// Read-only aggregate timings; never prints speech, transaction data or credentials.
// node --env-file=.env.local scripts/capture-baseline.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 });
try {
  const rows = await sql.begin('read only', async tx => tx`
    select source, count(*)::int as captures,
      count(total_ms)::int as timed_results,
      percentile_cont(0.5) within group (order by audio_warmup_ms) as warmup_p50_ms,
      percentile_cont(0.95) within group (order by audio_warmup_ms) as warmup_p95_ms,
      percentile_cont(0.5) within group (order by asr_ms) as asr_p50_ms,
      percentile_cont(0.95) within group (order by asr_ms) as asr_p95_ms,
      percentile_cont(0.5) within group (order by extract_ms) as extraction_p50_ms,
      percentile_cont(0.95) within group (order by extract_ms) as extraction_p95_ms,
      percentile_cont(0.5) within group (order by total_ms) as result_p50_ms,
      percentile_cont(0.95) within group (order by total_ms) as result_p95_ms
    from captures where created_at >= now() - interval '30 days' group by source
  `);
  console.log(JSON.stringify({ window: 'last 30 days', rows,
    limitations: 'Existing data does not distinguish widget from web or measure time through user correction. Result times cover reported results only.' }, null, 2));
} catch (error) {
  console.error('Baseline unavailable:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
