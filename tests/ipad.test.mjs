import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import * as core from '../public/core.js';
const root=new URL('../',import.meta.url);
const dest=fs.mkdtempSync(path.join(os.tmpdir(),'reading-room-ipad-test-'));
execFileSync('python3',[new URL('../ipad/prepare_web.py',import.meta.url).pathname,'--output',dest]);
process.on('exit',()=>fs.rmSync(dest,{recursive:true,force:true}));
const index=JSON.parse(fs.readFileSync(new URL('../public/bank/index.json',import.meta.url)));
const rw=index.find(q=>q.s==='rw'&&q.t==='mcq'),math=index.find(q=>q.s==='math'&&q.t==='mcq');
function mixed(){const state=core.fresh();for(const q of [rw,math]){const o={section:q.s,domain:q.d,skill:'All',difficulty:'All',mode:'all'},key=core.sessionKey(o);state.sessions[key]=core.makeSession([q.id],o,index,state.pace);state.sessions[key].choice=(q.a+1)%4;core.recordAnswer(state,key,index);state.bookmarks.push(q.id);core.toggleStrike(state,q.id,2);state.lastSession=key;}return state;}
function viewContext(state=mixed()){
 const dummy={textContent:'',classList:{add(){},remove(){}}},data=new Map();
 const context=vm.createContext({...core,ALL_SECTIONS:core.SECTIONS,console,performance,structuredClone,URL,Date,Map,Set,CSS:{escape:x=>x},
 localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
 document:{addEventListener(){},querySelector:s=>s==='#toast'?dummy:null,hidden:false},window:{addEventListener(){}},location:{hash:'#home',replace(v){this.hash=v;}},
 navigator:{onLine:true},setInterval(){},setTimeout(){},clearTimeout(){},queueMicrotask(){},
 syncCode:()=>'',syncMeta:()=>({version:-1,sent:''}),setSyncMeta(){},mirror(){},lineReader(){},
 });
 let source=fs.readFileSync(path.join(dest,'app.js'),'utf8').replace(/^import .*;\n/gm,'').replace('\ninit();','\n');
 source+='\nglobalThis.api={set(s,qs){state=s;questions=qs;byId=new Map(qs.map(q=>[q.id,q]));},home,nav,history,review,settings,parseRoute,resume,openSession,inspect,workspace,lastIn,go,parseState,syncNow,get:()=>state};';
 vm.runInContext(source,context);
 context.api.set(state,index);
 return context;
}

test('iPad bundles all Reading content and images, no Math question bodies',()=>{
 assert.equal(JSON.parse(fs.readFileSync(path.join(dest,'bank/index.json'))).length,3770);
 const content=[...JSON.parse(fs.readFileSync(path.join(dest,'questions.json')))];
 for(const file of fs.readdirSync(path.join(dest,'bank')).filter(x=>/^p\d+\.json$/.test(x)))content.push(...JSON.parse(fs.readFileSync(path.join(dest,'bank',file))));
 assert.equal(content.length,1845);
 const ids=new Set(index.filter(q=>q.s==='rw').map(q=>q.id));
 for(const item of content){assert.ok(ids.has(item.id));for(const image of item.images||[])assert.ok(fs.existsSync(path.join(dest,image)));}
});
test('every overview, history, review and settings surface omits mixed Math progress',()=>{
 const c=viewContext();
 for(const page of ['home','nav','history','review','settings']){
  const html=c.api[page]();assert.doesNotMatch(html,/Math|Desmos|#math|SAT MATH/,page);
  assert.ok(!html.includes(math.id),page);
 }
 assert.equal(c.api.parseState(mixed()).attempts.length,2);
 assert.equal(c.api.get().attempts.length,2);
 assert.equal(c.api.lastIn()[1].options.section,'rw');
});
test('Math deep links, resume and inspect cannot open hidden questions',async()=>{
 const c=viewContext(),key=c.api.get().lastSession;
 for(const hash of ['#math','#math/algebra']){c.location.hash=hash;assert.equal(c.api.parseRoute().view,'home');}
 c.api.resume(key);assert.notEqual(c.location.hash,'#practice');
 c.api.openSession(c.api.get().sessions[key].options);assert.notEqual(c.location.hash,'#practice');
 await c.api.inspect(math.id);
 c.location.hash='#practice';c.api.go();assert.equal(c.location.hash,'#home');
 assert.equal(c.api.get().attempts.length,2);
});
test('all bundled JavaScript parses and app has no external frames or scripts',()=>{
 for(const file of fs.readdirSync(dest).filter(x=>x.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(dest,file)]);
 const html=fs.readFileSync(path.join(dest,'index.html'),'utf8');assert.match(html,/frame-src 'none'/);assert.doesNotMatch(html,/desmos|https:\/\//i);
});

// Exercise the actual unchanged Worker/DO implementation with an in-memory SQL adapter.
const workerSource=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8')
 .replace("import {DurableObject} from 'cloudflare:workers';",'class DurableObject {constructor(ctx){this.ctx=ctx;}}')
 .replace("'../public/core.js'",JSON.stringify(new URL('../public/core.js',import.meta.url).href));
const worker=await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'));
function service(){let row=null;const ctx={storage:{sql:{exec(sql,...args){if(sql.startsWith('SELECT name'))return {toArray:()=>[{name:'version'}]};if(sql.startsWith('SELECT body'))return {toArray:()=>row?[row]:[]};if(sql.startsWith('INSERT'))row={body:args[0],version:args[1]};return {toArray:()=>[]};}}}};const progress=new worker.Progress(ctx,{});return {PROGRESS:{idFromName:x=>x,get:()=>progress},ASSETS:{fetch:()=>new Response('static')}};}
const code='a'.repeat(32);
async function request(env,method,state,version=-1){return worker.default.fetch(new Request(`https://example.test/api/sync${method==='GET'?'?since='+version:''}`,{method,headers:{authorization:'Bearer '+code},body:method==='POST'?JSON.stringify(state):undefined}),env);}
test('Mac → iPad → Mac sync preserves both sections, bookmarks, marks and session checkpoints',async()=>{
 const env=service(),mac=mixed();let response=await request(env,'POST',mac);assert.equal(response.status,200);
 const remote=await (await request(env,'GET')).json();assert.ok(core.validState(remote.state,index));
 const ipad=core.merge(core.fresh(),remote.state),q=index.find(q=>q.s==='rw'&&q.id!==rw.id&&q.t==='mcq');
 const options={section:'rw',domain:q.d,skill:q.k,difficulty:'All',mode:'all'},key=core.sessionKey(options);
 ipad.sessions[key]=core.makeSession([q.id],options,index,ipad.pace);ipad.sessions[key].choice=q.a;core.recordAnswer(ipad,key,index);
 await request(env,'POST',ipad);
 const combined=await (await request(env,'GET',null,remote.version)).json();
 assert.equal(combined.state.attempts.length,3);assert.ok(core.validState(combined.state,index));
 assert.deepEqual(combined.state.sessions[mac.lastSession],mac.sessions[mac.lastSession]);
 assert.ok(combined.state.bookmarks.includes(math.id));assert.deepEqual(combined.state.marks[math.id],mac.marks[math.id]);
 assert.equal((await request(env,'GET',null,combined.version)).status,204);
 // Reconnecting with an older offline Mac copy cannot drop the iPad answer.
 const staleReply=await (await request(env,'POST',mac)).json();assert.equal(staleReply.state.attempts.length,3);
});
test('Worker rejects invalid credentials without touching stored progress',async()=>{
 const env=service();const response=await worker.default.fetch(new Request('https://example.test/api/sync',{headers:{authorization:'Bearer short'}}),env);assert.equal(response.status,401);
});
test('iPad transport uses the existing Bearer-code protocol, handles 204, and propagates offline errors',async()=>{
 const env=service(),calls=[];
 globalThis.window={webkit:{messageHandlers:{sync:{async postMessage(message){calls.push(message);const response=await request(env,message.method,message.body?JSON.parse(message.body):null,Number(new URL(message.path,'https://example.test').searchParams.get('since')));return {status:response.status,body:await response.text(),headers:Object.fromEntries(response.headers)};}}}}};
 const sync=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(dest,'sync.js')).toString('base64'));
 const first=await sync.push(code,mixed());assert.equal(first.version,1);assert.equal(calls[0].path,'/api/sync');assert.ok(!calls[0].path.includes(code));
 const unchanged=await sync.pull(code,first.version);assert.deepEqual(unchanged,{version:1});
 window.webkit.messageHandlers.sync.postMessage=async()=>{throw Error('Offline');};
 await assert.rejects(sync.push(code,mixed()),/Offline/);delete globalThis.window;
});
