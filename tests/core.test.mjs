import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,DOMAINS,stats,queue,sessionKey,makeSession,recordAnswer,nextQuestion,validState} from '../public/core.js';
// Synthetic fixtures for application logic, not practice-bank content.
const questions=[
 {id:'fixture-1',skill:'Command of Evidence',difficulty:'Easy',answer:2},
 {id:'fixture-2',skill:'Inferences',difficulty:'Hard',answer:0},
 {id:'fixture-3',skill:'Words in Context',difficulty:'Medium',answer:1}
];
function start(s,domain){const o={domain,difficulty:'All',skill:'All',mode:'all'},k=sessionKey(o);s.sessions[k]=makeSession(queue(questions,s,o),o,questions,s.pace);s.lastSession=k;return [k,s.sessions[k]];}
test('modules keep independent checkpoints through serialization',()=>{const s=fresh(),[a,x]=start(s,DOMAINS[0]);x.choice=2;x.remaining=20;recordAnswer(s,a,questions);nextQuestion(x,questions,s.pace);const [b,y]=start(s,DOMAINS[1]);y.choice=1;const copy=JSON.parse(JSON.stringify(s));assert.ok(validState(copy,questions));assert.equal(copy.sessions[a].index,1);assert.equal(copy.sessions[b].index,0);assert.equal(copy.sessions[b].choice,1);});
test('grading prevents double submissions and statistics count latest unique answers',()=>{const s=fresh(),[k,x]=start(s,DOMAINS[0]);x.choice=1;recordAnswer(s,k,questions);assert.equal(recordAnswer(s,k,questions),false);assert.equal(stats(questions,s.attempts).wrong,1);x.revealed=false;x.choice=2;recordAnswer(s,k,questions);assert.equal(stats(questions,s.attempts).done,1);assert.equal(stats(questions,s.attempts).right,1);assert.equal(stats(questions,s.attempts).wrong,0);});
test('invalid checkpoints and falsified backup results are rejected',()=>{const s=fresh(),[k,x]=start(s,DOMAINS[0]);x.choice=2;recordAnswer(s,k,questions);assert.ok(validState(s,questions));s.attempts[0].correct=false;assert.equal(validState(s,questions),false);s.attempts[0].correct=true;x.index=100;assert.equal(validState(s,questions),false);});
test('unanswered questions do not count as incorrect',()=>{assert.equal(stats(questions,[]).wrong,0);assert.equal(stats(questions,[]).accuracy,null);});
