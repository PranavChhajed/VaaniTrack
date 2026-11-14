import { readFile, writeFile } from 'node:fs/promises';
import { quickExpense } from '../src/lib/quickExpense';
async function main() {
  // Existing synthetic corpus, not private recordings. Compare only cases the
  // baseline itself labelled correct; this is compatibility, not new ground truth.
  const corpus=JSON.parse(await readFile('.captures/eval/baseline.json','utf8'));
  let covered=0; const differences: string[]=[];
  for(const c of corpus.results) {
    const rows=quickExpense(c.utterance,corpus.today,'UPI');
    if(!rows) continue;
    covered++;
    if(c.outcome!=='correct') continue;
    const a=rows[0], b=c.returned[0];
    if(c.returned.length!==1 || a.amount!==b.amount || a.date!==b.date ||
      a.paymentMethod!==b.paymentMethod || b.needsConfirmation ||
      a.description!==String(b.description).toLowerCase()) differences.push(c.utterance);
  }
  const times=[];
  for(let i=0;i<1000;i++) {
    const started=performance.now(); quickExpense('250 lunch','2026-11-15','UPI');
    times.push(performance.now()-started);
  }
  times.sort((a,b)=>a-b);
  const report={cases:corpus.results.length,covered,differences,p50Ms:times[499],p95Ms:times[949],
    limitation:'Parser compute only; excludes audio, network, UI and human correction. Corpus compatibility is not an accuracy estimate.'};
  console.log(JSON.stringify(report,null,2));
  await writeFile('qa/shots/verification/quick-eval.json',JSON.stringify(report,null,2));
  if(differences.length) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
