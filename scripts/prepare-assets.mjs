import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('public/questions/',root),{recursive:true});
let count=0;
for(const file of (await readdir(new URL('asset-packs/',root))).filter(x=>x.endsWith('.json')).sort()){
 const pack=JSON.parse(await readFile(new URL('asset-packs/'+file,root),'utf8'));
 for(const [name,base64] of Object.entries(pack)){
  if(!/^[a-f0-9]{8}-\d+\.webp$/.test(name))throw Error('Invalid asset filename');
  await writeFile(new URL('public/questions/'+name,root),Buffer.from(base64,'base64'));count++;
 }
}
console.log(`Prepared ${count} original question images (lossless WebP).`);
