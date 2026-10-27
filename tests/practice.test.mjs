import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SECTIONS,fresh,stats,queue,sessionKey,makeSession,recordAnswer,nextQuestion,validState,budget} from '../public/core.js';
const index=JSON.parse(fs.readFileSync(new URL('../public/bank/index.json',import.meta.url)));
const legacy=JSON.parse(fs.readFileSync(new URL('../public/questions.json',import.meta.url)));
const items=new Map(legacy.map(q=>[q.id,q]));
for(const f of fs.readdirSync(new URL('../public/bank/',import.meta.url)).filter(f=>/^p\d+\.json$/.test(f)))for(const it of JSON.parse(fs.readFileSync(new URL('../public/bank/'+f,import.meta.url))))items.set(it.id,it);
const opts=(section,domain)=>({section,domain,skill:'All',difficulty:'All',mode:'all'});
function start(state,o){const ids=queue(index,state,o),key=sessionKey(o);state.sessions[key]=makeSession(ids,o,index,state.pace);state.lastSession=key;return [key,state.sessions[key]];}
test('collection is complete, unique, and every question has content in its pack',()=>{assert.equal(index.length,3770);assert.equal(new Set(index.map(q=>q.id)).size,3770);
 for(const q of index){const it=items.get(q.id);assert.ok(it,q.id);assert.ok(SECTIONS[q.s].domains[q.d].includes(q.k),q.k);assert.ok(['Easy','Medium','Hard'].includes(q.l));
  if(q.t==='mcq'){assert.equal(it.choices.length,4,q.id);assert.equal(q.a,it.answer);}else{assert.equal(q.p===-1,false);assert.deepEqual(q.a??[],it.keys);}
  if(q.p===-1)for(const image of it.images)assert.ok(fs.existsSync(new URL('../public'+image,import.meta.url)));}
 assert.deepEqual(Object.keys(SECTIONS).map(s=>index.filter(q=>q.s===s).length),[1845,1925]);});
test('existing question IDs are unchanged, so saved progress still applies',()=>{for(const q of legacy)assert.equal(index.find(x=>x.id===q.id).p,-1);});
test('domains resume independently, preserving choices, timing and revealed answers',()=>{const s=fresh(),[a,sa]=start(s,opts('rw','Information and Ideas'));sa.choice=index.find(q=>q.id===sa.ids[0]).a;sa.remaining=35;sa.elapsed=36;assert.ok(recordAnswer(s,a,index));const [b,sb]=start(s,opts('math','Algebra'));sb.response='12';sb.remaining=12;const copy=JSON.parse(JSON.stringify(s));assert.ok(validState(copy,index));assert.equal(copy.sessions[a].remaining,35);assert.ok(copy.sessions[a].revealed);assert.equal(copy.sessions[b].response,'12');nextQuestion(copy.sessions[a],index,s.pace);assert.equal(copy.sessions[a].index,1);assert.equal(copy.sessions[b].index,0);});
test('a session finishes only after the final answer and leaves other sessions intact',()=>{const s=fresh(),[k,a]=start(s,opts('rw','Craft and Structure'));assert.equal(nextQuestion(a,index,s.pace),false);a.index=a.ids.length-1;a.choice=0;recordAnswer(s,k,index);nextQuestion(a,index,s.pace);assert.equal(a.complete,true);assert.ok(validState(s,index));});
test('pacing uses the SAT averages per section',()=>{assert.equal(budget(index.find(q=>q.s==='math')),95);assert.equal(budget(index.find(q=>q.s==='rw')),71);assert.equal(budget({s:'rw',k:'Words in Context'},'category'),45);assert.equal(stats(index,[]).accuracy,null);});
