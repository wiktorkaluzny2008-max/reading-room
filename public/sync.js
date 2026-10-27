// Sync codes: 32 random base-32 characters (160 bits). The code stays in this browser only and is not
// included in exported backups.
const SYNC_KEY='reading-room-sync', ALPHABET='abcdefghijklmnopqrstuvwxyz234567';
export function syncCode(){try{return localStorage.getItem(SYNC_KEY)||'';}catch{return '';}}
export function setSyncCode(code){try{code?localStorage.setItem(SYNC_KEY,code):localStorage.removeItem(SYNC_KEY);return true;}catch{return false;}}
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b=>ALPHABET[b%32]).join('');
export const normalizeCode = v => String(v||'').toLowerCase().replace(/[^a-z2-7]/g,'');
export const formatCode = c => c.match(/.{1,4}/g).join('-');
const META_KEY='reading-room-sync-meta';
// What this browser last exchanged with the server: the server's version and a hash of the progress sent.
export function syncMeta(code){try{const m=JSON.parse(localStorage.getItem(META_KEY));return m?.code===code?m:{code,version:-1,sent:''};}catch{return {code,version:-1,sent:''};}}
export function setSyncMeta(m){try{localStorage.setItem(META_KEY,JSON.stringify(m));}catch{}}
async function call(code,url,init={}){const res=await fetch(url,{...init,headers:{authorization:'Bearer '+code,...init.headers}});if(res.status===204)return {version:Number(res.headers.get('x-sync-version'))};const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Sync failed.');return data;}
// Uploads this browser's progress; the reply has the merged copy only if this browser was missing something.
export const push = (code,state) => call(code,'/api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)});
// Asks whether anything changed since a version; the reply has the copy only if it did.
export const pull = (code,version) => call(code,`/api/sync?since=${version}`);
