// Progress is written to two independent browser stores on every change: localStorage (synchronous, survives
// a crash mid-answer) and IndexedDB (a mirror plus daily snapshots). On load the newest valid copy wins, so
// losing or corrupting one store does not lose progress.
const DB='reading-room', STORE='progress', SNAPSHOTS=14;
let db;
function open(){if(db)return db;db=new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.catch(()=>{db=null;});return db;}
function tx(mode,fn){return open().then(d=>new Promise((resolve,reject)=>{const t=d.transaction(STORE,mode),out=fn(t.objectStore(STORE));t.oncomplete=()=>resolve(out?.result);t.onerror=t.onabort=()=>reject(t.error);}));}
export const idbGet = key => tx('readonly',s=>s.get(key)).catch(()=>undefined);
export const idbKeys = () => tx('readonly',s=>s.getAllKeys()).catch(()=>[]);
export function idbPut(key,value){return tx('readwrite',s=>{s.put(value,key);}).catch(()=>false);}
export async function mirror(json){const day='snapshot-'+new Date().toISOString().slice(0,10);await idbPut('latest',json);await idbPut(day,json);
 const old=(await idbKeys()).filter(k=>String(k).startsWith('snapshot-')).sort().slice(0,-SNAPSHOTS);if(old.length)await tx('readwrite',s=>{for(const k of old)s.delete(k);}).catch(()=>{});}
export async function snapshots(){return (await idbKeys()).filter(k=>String(k).startsWith('snapshot-')).sort().reverse();}
export async function requestPersistence(){try{return await navigator.storage?.persist?.()??false;}catch{return false;}}
export async function persisted(){try{return await navigator.storage?.persisted?.()??false;}catch{return false;}}
