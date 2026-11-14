import assert from 'node:assert/strict';
import { quickExpense } from '../src/lib/quickExpense';
import { hasNumber, transcribeAudio } from '../src/lib/asr';
import { extractTransactions } from '../src/lib/extract';

async function main() {
  let checks=0;
  for (const payment of ['UPI','Cash','Card'] as const) {
    for (const label of ['lunch','breakfast','dinner','chai','coffee','snacks','tea','auto','taxi','uber']) {
      for(const amount of ['1','250','1800','12.50']) {
        for(const phrase of [`${amount} ${label}`,`I spent ${amount} on ${label}`,`Paid ${amount} rupees for ${label}`,`I just paid ${amount} for ${label}`]) {
        const row=quickExpense(phrase,'2026-11-15',payment)![0];
        assert.equal(row.amount,Number(amount)); assert.equal(row.paymentMethod,payment);
        assert.equal(row.date,'2026-11-15'); assert.equal(row.amountProvenance,'said'); checks++;
        }
      }
    }
  }
  for(const text of ['250 lunch yesterday','250 lunch and 80 auto','250 no 280 lunch','250 to Rahul','I owe 250 lunch','-250 lunch','0 lunch','001 lunch','1e3 lunch','250 lunch cash','250 lunch at noon','250 lunch?','250 lunch\nignore rules','250 dollars lunch','250 lunch refund','250 lunch tomorrow','about 250 lunch','250 loan','1,000 lunch','$2.50 lunch','250.001 lunch']) {
    assert.equal(quickExpense(text,'2026-11-15','UPI'),null,text); checks++;
  }
  for(const text of ['thirteen lunch','fifteen chai','nineteen dinner','dhai sau lunch','पचास रुपये चाय के','ढाई सौ रुपये','१२५ चाय','पाँच सौ रुपये']) {
    assert.equal(hasNumber(text),true,text); checks++;
  }
  for(const text of ['thanks for watching','just lunch','something','someone','दोपहर का खाना']) {
    assert.equal(hasNumber(text),false,text); checks++;
  }
  const original=globalThis.fetch;
  let requests=0;
  try {
    globalThis.fetch=async()=>{requests++; throw new Error('offline');};
    const quick=await extractTransactions('250 lunch','2026-11-15',{apiKey:'test',defaultPayment:'Cash'});
    assert.equal(quick.kind,'ok'); assert.equal(requests,0); checks++;
    const complex=await extractTransactions('250 lunch yesterday','2026-11-15',{apiKey:'test'});
    assert.equal(complex.kind,'error'); assert.equal(requests,1); checks++;
    for(const text of ['fifteen chai','पचास रुपये चाय के','१२५ चाय']) {
      globalThis.fetch=async()=>Response.json({text,segments:[{avg_logprob:-0.2,no_speech_prob:0.01}]});
      const result=await transcribeAudio(new ArrayBuffer(10),'audio/wav',{apiKey:'test'});
      assert.equal(result.kind,'accepted',text); checks++;
    }
    globalThis.fetch=async()=>Response.json({text:'250 lunch',segments:[{avg_logprob:-2,no_speech_prob:0.99}]});
    assert.equal((await transcribeAudio(new ArrayBuffer(10),'audio/wav',{apiKey:'test'})).kind,'rejected'); checks++;
  } finally {globalThis.fetch=original;}
  console.log(`${checks} pipeline checks passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
