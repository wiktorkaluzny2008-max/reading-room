// Serves the static site and the progress sync API. Each sync code maps to one Durable Object that holds a
// single copy of progress and a version number that goes up whenever that progress really changes. Uploads
// are merged into it (answers are never dropped). Replies only carry the full copy when the browser lacks
// something, and a version check with no changes returns no body, so idle syncing costs a few bytes.
// The code is the only credential, so it is long and random and travels in a header, not the URL.
import {DurableObject} from 'cloudflare:workers';
import {merge,fingerprint} from '../public/core.js';

const MAX_BYTES = 4_000_000;
const CODE = /^[a-z2-7]{32}$/;
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const plausible = s => s&&s.version===2&&Array.isArray(s.attempts)&&s.sessions&&typeof s.sessions==='object'&&!Array.isArray(s.sessions)&&Array.isArray(s.bookmarks)&&Number.isFinite(s.savedAt??0);

export class Progress extends DurableObject {
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)');
  // Copies stored before versions existed get version 1.
  if(!ctx.storage.sql.exec("SELECT name FROM pragma_table_info('progress') WHERE name = 'version'").toArray().length)ctx.storage.sql.exec('ALTER TABLE progress ADD COLUMN version INTEGER NOT NULL DEFAULT 1');}
 read(){const row=this.ctx.storage.sql.exec('SELECT body, version FROM progress WHERE id = 1').toArray()[0];return row?{state:JSON.parse(row.body),version:row.version}:{state:null,version:0};}
 // Version check: no state in the reply when the browser is already up to date.
 async check(since){const {state,version}=this.read();return since===version?{version}:{version,state};}
 async upload(incoming){const {state:stored,version}=this.read(),merged=stored?merge(stored,incoming):incoming;merged.savedAt=Math.max(stored?.savedAt??0,incoming.savedAt??0);
  const print=fingerprint(merged);let next=version;
  if(!stored||print!==fingerprint(stored)){const body=JSON.stringify(merged);if(body.length>MAX_BYTES)throw Error('too large');next=version+1;this.ctx.storage.sql.exec('INSERT INTO progress (id, body, version) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, version = excluded.version',body,next);}
  return print===fingerprint(incoming)?{version:next}:{version:next,state:merged};}
}

export default {
 async fetch(request,env){const url=new URL(request.url);if(url.pathname!=='/api/sync')return env.ASSETS.fetch(request);
  const code=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!CODE.test(code))return json({error:'Invalid sync code.'},401);
  const stub=env.PROGRESS.get(env.PROGRESS.idFromName(code));
  if(request.method==='GET'){const since=Number(url.searchParams.get('since')),r=await stub.check(Number.isInteger(since)?since:-1);return r.state===undefined?new Response(null,{status:204,headers:{'x-sync-version':String(r.version),'cache-control':'no-store'}}):json(r);}
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  const text=await request.text();if(text.length>MAX_BYTES)return json({error:'Progress is too large to sync.'},413);
  let incoming;try{incoming=JSON.parse(text);}catch{return json({error:'Not valid JSON.'},400);}if(!plausible(incoming))return json({error:'Not Reading Room progress.'},400);
  try{return json(await stub.upload(incoming));}catch{return json({error:'Progress could not be saved.'},500);}}
};
