export const SECTIONS = {
 rw:{name:'Reading and Writing',short:'Reading & Writing',pace:71,paceNote:'54 questions in 64 minutes',domains:{
  'Information and Ideas':['Central Ideas and Details','Command of Evidence','Inferences'],
  'Craft and Structure':['Words in Context','Text Structure and Purpose','Cross-Text Connections'],
  'Expression of Ideas':['Rhetorical Synthesis','Transitions'],
  'Standard English Conventions':['Boundaries','Form, Structure, and Sense']}},
 math:{name:'Math',short:'Math',pace:95,paceNote:'44 questions in 70 minutes',domains:{
  'Algebra':['Linear equations in one variable','Linear functions','Linear equations in two variables','Systems of two linear equations in two variables','Linear inequalities in one or two variables'],
  'Advanced Math':['Nonlinear functions','Nonlinear equations in one variable and systems of equations in two variables','Equivalent expressions'],
  'Problem-Solving and Data Analysis':['Ratios, rates, proportional relationships, and units','Percentages','One-variable data: Distributions and measures of center and spread','Two-variable data: Models and scatterplots','Probability and conditional probability','Inference from sample statistics and margin of error','Evaluating statistical claims: Observational studies and experiments'],
  'Geometry and Trigonometry':['Area and volume','Lines, angles, and triangles','Right triangles and trigonometry','Circles']}}
};
export const DIFFICULTIES = ['All','Easy','Medium','Hard'];
export const MODES = [['new','New questions'],['all','All questions'],['wrong','Incorrect answers'],['bookmarked','Bookmarked']];
export const KEY = 'reading-room-v1';
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const fresh = () => ({version:2,attempts:[],sessions:{},bookmarks:[],pace:'average',lastSession:null,savedAt:0});
const SKILL_PACE = {'Central Ideas and Details':75,'Command of Evidence':90,'Inferences':90,'Words in Context':45,'Text Structure and Purpose':60,'Cross-Text Connections':90,'Rhetorical Synthesis':75,'Transitions':50,'Boundaries':50,'Form, Structure, and Sense':50};
export const budget = (q,mode='average') => q?.s==='math'?95:mode==='average'?71:(SKILL_PACE[q?.k]||71);
export function latest(attempts){const map=new Map();for(const a of attempts)map.set(a.id,a);return map;}
export function stats(questions,attempts){const map=latest(attempts),done=questions.filter(q=>map.has(q.id));const right=done.filter(q=>map.get(q.id).correct).length;return {total:questions.length,done:done.length,right,wrong:done.length-right,accuracy:done.length?Math.round(right/done.length*100):null};}
export function matches(q,{section,domain,skill='All',difficulty='All'}){return q.s===section&&(domain==='All'||q.d===domain)&&(skill==='All'||q.k===skill)&&(difficulty==='All'||q.l===difficulty);}
export function queue(questions,state,options){const map=latest(state.attempts),mode=options.mode||'new';return questions.filter(q=>matches(q,options)&&(mode==='new'?!map.has(q.id):mode==='wrong'?map.has(q.id)&&!map.get(q.id).correct:mode==='bookmarked'?state.bookmarks.includes(q.id):true)).map(q=>q.id);}
export const sessionKey = o => JSON.stringify([o.section,o.domain,o.skill||'All',o.difficulty||'All',o.mode||'new']);
export function makeSession(ids,options,questions,pace){return {ids,index:0,choice:-1,response:'',revealed:false,complete:false,remaining:budget(questions.find(q=>q.id===ids[0]),pace),elapsed:0,paused:false,options,updatedAt:Date.now()};}

// Student-produced responses: accept any key's exact text or the same numeric value (so 6/34 matches 3/17).
const num = v => {const t=String(v).trim().replace(/[\s,]/g,'').replace(/[−–]/g,'-');const f=t.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);if(f)return Number(f[2])?Number(f[1])/Number(f[2]):NaN;return /^-?(\d+\.?\d*|\.\d+)$/.test(t)?Number(t):NaN;};
export const cleanResponse = v => String(v??'').trim().replace(/\s+/g,'').replace(/[−–]/g,'-').slice(0,12);
export function checkResponse(response,keys){const r=cleanResponse(response);if(!r||!keys?.length)return false;return keys.some(k=>{const key=cleanResponse(k);if(key.toLowerCase()===r.toLowerCase())return true;const a=num(r),b=num(key);return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9;});}
export const selfGraded = q => q.t==='spr'&&!q.a;

export function recordAnswer(state,key,questions,selfCorrect){const s=state.sessions[key];if(!s||s.revealed||s.complete)return false;const q=questions.find(q=>q.id===s.ids[s.index]);if(!q)return false;let attempt;
 if(q.t==='mcq'){if(s.choice<0)return false;attempt={id:q.id,choice:s.choice,correct:s.choice===q.a};}
 else{const response=cleanResponse(s.response);if(!response)return false;if(selfGraded(q)&&typeof selfCorrect!=='boolean')return false;attempt={id:q.id,response,correct:selfGraded(q)?selfCorrect:checkResponse(response,q.a)};}
 state.attempts.push({...attempt,at:Date.now(),seconds:Math.round(s.elapsed)});s.revealed=true;s.updatedAt=Date.now();return true;}
export function nextQuestion(s,questions,pace){if(!s.revealed)return false;if(s.index===s.ids.length-1){s.complete=true;return true;}s.index++;s.choice=-1;s.response='';s.revealed=false;s.remaining=budget(questions.find(q=>q.id===s.ids[s.index]),pace);s.elapsed=0;s.paused=false;s.updatedAt=Date.now();return true;}

// Version 1 only had Reading and Writing sessions keyed by [domain,difficulty,skill,mode].
export function migrate(s){if(!s||s.version!==1||!s.sessions||typeof s.sessions!=='object')return s;const sessions={};let lastSession=null;
 for(const [key,v] of Object.entries(s.sessions)){if(!v?.options)continue;const options={section:'rw',domain:v.options.domain,skill:v.options.skill||'All',difficulty:v.options.difficulty||'All',mode:v.options.mode||'all'},k=sessionKey(options);sessions[k]={...v,response:'',options};if(key===s.lastSession)lastSession=k;}
 return {...s,version:2,sessions,lastSession,savedAt:0};}

export function validState(s,questions){
 const byId=new Map(questions.map(q=>[q.id,q])); const finite=n=>Number.isFinite(n)&&n>=0;
 if(!s||s.version!==2||!Array.isArray(s.attempts)||s.attempts.length>200000||!Array.isArray(s.bookmarks)||!s.bookmarks.every(id=>byId.has(id))||!['average','category'].includes(s.pace)||!s.sessions||typeof s.sessions!=='object'||Array.isArray(s.sessions)||!finite(s.savedAt??0))return false;
 if(!s.attempts.every(a=>{const q=byId.get(a.id);if(!q||typeof a.correct!=='boolean'||!finite(a.at)||!finite(a.seconds))return false;if(q.t==='mcq')return Number.isInteger(a.choice)&&a.choice>=0&&a.choice<=3&&a.correct===(a.choice===q.a);return typeof a.response==='string'&&a.response.length>0&&a.response.length<=12&&(selfGraded(q)||a.correct===checkResponse(a.response,q.a));}))return false;
 if(!Object.entries(s.sessions).every(([key,v])=>{const o=v?.options,sec=SECTIONS[o?.section];if(!sec)return false;const skills=o.domain==='All'?Object.values(sec.domains).flat():sec.domains[o.domain];
  return skills&&['All',...skills].includes(o.skill)&&DIFFICULTIES.includes(o.difficulty)&&MODES.some(([m])=>m===o.mode)&&key===sessionKey(o)&&Array.isArray(v.ids)&&v.ids.length>0&&v.ids.length<=questions.length&&new Set(v.ids).size===v.ids.length&&v.ids.every(id=>byId.has(id)&&matches(byId.get(id),o))&&Number.isInteger(v.index)&&v.index>=0&&v.index<v.ids.length&&Number.isInteger(v.choice)&&v.choice>=-1&&v.choice<=3&&typeof(v.response??'')==='string'&&typeof v.revealed==='boolean'&&typeof v.complete==='boolean'&&typeof v.paused==='boolean'&&finite(v.remaining)&&v.remaining<=3600&&finite(v.elapsed)&&finite(v.updatedAt);}))return false;
 return s.lastSession===null||Object.hasOwn(s.sessions,s.lastSession);
}
export const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
