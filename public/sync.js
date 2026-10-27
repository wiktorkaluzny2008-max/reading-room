// Sync codes: 32 random base-32 characters (160 bits). The code stays in this browser only and is not
// included in exported backups.
const SYNC_KEY='reading-room-sync', ALPHABET='abcdefghijklmnopqrstuvwxyz234567';
export function syncCode(){try{return localStorage.getItem(SYNC_KEY)||'';}catch{return '';}}
export function setSyncCode(code){try{code?localStorage.setItem(SYNC_KEY,code):localStorage.removeItem(SYNC_KEY);return true;}catch{return false;}}
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b=>ALPHABET[b%32]).join('');
export const normalizeCode = v => String(v||'').toLowerCase().replace(/[^a-z2-7]/g,'');
export const formatCode = c => c.match(/.{1,4}/g).join('-');
// Uploads this browser's progress and returns the server's merged copy.
export async function push(code,state){const res=await fetch('/api/sync',{method:'POST',headers:{authorization:'Bearer '+code,'content-type':'application/json'},body:JSON.stringify(state)});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Sync failed.');return data.state;}
