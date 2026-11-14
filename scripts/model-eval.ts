// Synthetic, explicitly labelled cases. Calls models directly; never writes a journal.
// npx tsx --env-file=.env.local scripts/model-eval.ts [local|cloud]
import { writeFile, mkdir } from 'node:fs/promises';
import { buildSystemPrompt, extractTransactions } from '../src/lib/extract';
import type { ExtractedTransaction } from '../src/lib/types';

export const cases = [
  { text: '250 lunch', amounts: [250], descriptions: ['lunch'] },
  { text: '120 chai', amounts: [120], descriptions: ['chai'] },
  { text: '200 petrol', amounts: [200], descriptions: ['petrol'] },
  { text: '45 print out', amounts: [45], descriptions: ['print'] },
  { text: 'two fifty lunch', amounts: [250], descriptions: ['lunch'] },
  { text: 'dhai sau lunch', amounts: [250], descriptions: ['lunch'] },
  { text: 'ढाई सौ रुपये चाय पर खर्च किए', amounts: [250] },
  { text: 'पचास रुपये चाय के', amounts: [50] },
  { text: '40, no, 20, no, 30 rupees for lunch. No, 25', amounts: [25], descriptions: ['lunch'] },
  { text: '250 lunch and 80 auto', amounts: [250,80] },
  { text: 'Paid 500 to Rahul', amounts: [500], payee: 'Rahul', review: false },
  { text: '250 to Pushpa', amounts: [250], review: true },
  { text: '300 lunch paid in cash yesterday', amounts: [300], payment: 'cash', date: '2026-11-14' },
  { text: 'one lakh rent', amounts: [100000], descriptions: ['rent'] },
  { text: 'Thank you for watching', amounts: [] },
  { text: 'I did not spend anything today', amounts: [] },
];

async function main() {
  const local = process.argv[2] === 'local';
  const models = local ? ['qwen3:0.6b'] : (process.env.EVAL_MODELS || 'openai/gpt-oss-120b,openai/gpt-oss-20b').split(',');
  const results: unknown[] = [];
  await mkdir('qa/shots/verification', { recursive:true });
  for (const model of models) {
    for (const c of cases) {
      const start = performance.now();
      let rows: ExtractedTransaction[] = []; let error = '';
      try {
        if (local) {
          const response = await fetch('http://127.0.0.1:11435/v1/chat/completions', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({model, stream:false, response_format:{type:'json_object'}, temperature:0, max_tokens:700, messages:[
              {role:'system', content:buildSystemPrompt('2026-11-15','UPI')}, {role:'user',content:c.text}]}),
            signal:AbortSignal.timeout(120000),
          });
          const body = await response.json();
          if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
          rows = JSON.parse(body.choices[0].message.content).transactions;
        } else {
          const result = await extractTransactions(c.text,'2026-11-15',{apiKey:process.env.GROQ_API_KEY!,model,skipQuick:true});
          if(result.kind !== 'ok') throw new Error(result.kind === 'error' ? `${result.status}: ${result.detail}` : result.kind);
          rows = result.transactions;
        }
      } catch(e) { error = String(e); }
      const pass = !error && Array.isArray(rows) && rows.length === c.amounts.length && rows.every((r,i) =>
        r.amount === c.amounts[i] &&
        (!c.descriptions || String(r.description).toLowerCase().includes(c.descriptions[i])) &&
        (!c.payee || r.payee === c.payee) &&
        (c.review === undefined || r.needsConfirmation === c.review) &&
        (!c.payment || String(r.paymentMethod).toLowerCase() === c.payment) &&
        (!c.date || r.date === c.date));
      const row = {model,text:c.text,pass,ms:Math.round(performance.now()-start),rows,error};
      results.push(row);
      console.log(model,pass?'PASS':'FAIL',row.ms,c.text);
      await writeFile(`qa/shots/verification/model-eval-${local?'local':'cloud'}.json`,JSON.stringify(results,null,2));
      if(!local) await new Promise(r=>setTimeout(r,11000));
    }
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
