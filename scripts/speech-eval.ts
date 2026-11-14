import { readFile, writeFile } from 'node:fs/promises';
import { transcribeAudio } from '../src/lib/asr';
const expected = [[250],[15],[19],[250],[250,80],[280],[],[]];
async function main() {
const results=[];
for(let i=0;i<expected.length;i++) {
  const bytes=await readFile(`qa/shots/verification/speech/${i}.wav`);
  for(const language of ['en','auto'] as const) {
    const result=await transcribeAudio(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'audio/wav',{apiKey:process.env.GROQ_API_KEY!,language});
    results.push({case:i,language,expected:expected[i],result});
    console.log(i,language,result.kind,result.ms);
    await writeFile('qa/shots/verification/speech-eval.json',JSON.stringify(results,null,2));
  }
}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
