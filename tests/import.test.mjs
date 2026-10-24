import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const questions=JSON.parse(fs.readFileSync(new URL('../public/questions.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(new URL('../imports/information-and-ideas-2026-10-24.json',import.meta.url)));
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
test('every source question appears exactly once, and all additions have images',()=>{
  assert.equal(manifest.sourceQuestionIds.length,555);
  assert.equal(manifest.addedQuestionIds.length,455);
  for(const id of manifest.sourceQuestionIds)assert.equal(questions.filter(q=>q.id===id).length,1,id);
  const additions=questions.filter(q=>manifest.addedQuestionIds.includes(q.id));
  assert.equal(additions.reduce((sum,q)=>sum+q.images.length,0),460);
  const seen=new Set();
  for(const q of questions){
    const key=normalize(q.passage+q.prompt+q.choices.join(' '));
    assert.ok(!seen.has(key),`Duplicate content: ${q.id}`);seen.add(key);
    assert.ok(q.images.length>0,q.id);
  }
});
