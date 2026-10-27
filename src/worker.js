// Serves the static site and the progress sync API. Each sync code maps to one Durable Object that holds a
// single copy of progress; every upload is merged into it (answers are never dropped) and the merged copy is
// returned. The code is the only credential, so it is long and random and travels in a header, not the URL.
import {DurableObject} from 'cloudflare:workers';
import {merge} from '../public/core.js';

const MAX_BYTES = 4_000_000;
const CODE = /^[a-z2-7]{32}$/;
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const plausible = s => s&&s.version===2&&Array.isArray(s.attempts)&&s.sessions&&typeof s.sessions==='object'&&!Array.isArray(s.sessions)&&Array.isArray(s.bookmarks)&&Number.isFinite(s.savedAt??0);

export class Progress extends DurableObject {
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)');}
 read(){const row=this.ctx.storage.sql.exec('SELECT body FROM progress WHERE id = 1').toArray()[0];return row?JSON.parse(row.body):null;}
 async sync(incoming){const stored=this.read(),merged=stored&&incoming?merge(stored,incoming):stored||incoming;
  if(merged&&incoming){merged.savedAt=Math.max(stored?.savedAt??0,incoming.savedAt??0);const body=JSON.stringify(merged);if(body.length>MAX_BYTES)throw Error('too large');this.ctx.storage.sql.exec('INSERT INTO progress (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body',body);}
  return merged;}
}

export default {
 async fetch(request,env){const url=new URL(request.url);if(url.pathname!=='/api/sync')return env.ASSETS.fetch(request);
  const code=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!CODE.test(code))return json({error:'Invalid sync code.'},401);
  const stub=env.PROGRESS.get(env.PROGRESS.idFromName(code));
  if(request.method==='GET')return json({state:await stub.sync(null)});
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  const text=await request.text();if(text.length>MAX_BYTES)return json({error:'Progress is too large to sync.'},413);
  let incoming;try{incoming=JSON.parse(text);}catch{return json({error:'Not valid JSON.'},400);}if(!plausible(incoming))return json({error:'Not Reading Room progress.'},400);
  try{return json({state:await stub.sync(incoming)});}catch{return json({error:'Progress could not be saved.'},500);}}
};
