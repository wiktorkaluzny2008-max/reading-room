// Loads question content on demand and turns imported question-bank HTML (MathML, SVG, tables) into safe markup.
const packs=new Map(), items=new Map();
function pack(p){const url=p===-1?'/questions.json':`/bank/p${String(p).padStart(2,'0')}.json`;if(!packs.has(p))packs.set(p,fetch(url).then(r=>{if(!r.ok)throw Error('Question could not be loaded. Check your connection and try again.');return r.json();}).then(list=>{for(const it of list)items.set(it.id,it);}).catch(e=>{packs.delete(p);throw e;}));return packs.get(p);}
export const item = id => items.get(id);
export async function load(meta){if(!items.has(meta.id))await pack(meta.p);return items.get(meta.id);}

const KEEP=new Set('p div span br strong b em i u sub sup ul ol li table thead tbody tfoot tr td th caption col colgroup figure figcaption blockquote cite img svg g path line polyline polygon rect circle ellipse text tspan defs use clippath clipPath pattern marker symbol title desc style math mrow mi mn mo ms mtext mspace mfrac msqrt mroot msub msup msubsup munder mover munderover mtable mtr mtd mstyle mpadded mphantom menclose mfenced semantics annotation'.split(' '));
const DROP=new Set(['script','iframe','object','embed','link','meta','form','input','button','textarea','select','foreignobject','audio','video','base']);
const MATHML='http://www.w3.org/1998/Math/MathML';
let scope=0;
function safeCss(css){return !/@import|expression\s*\(|url\(\s*['"]?(?!#)/i.test(css);}
function scopeCss(css,id){return css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/([^{}]+)\{/g,(_,sel)=>sel.split(',').map(s=>`#${id} ${s.trim()}`).join(',')+'{');}
function walk(node){for(const el of [...node.children]){const name=el.localName.toLowerCase();
 if(DROP.has(name)){el.remove();continue;}
 if(!KEEP.has(el.localName)&&!KEEP.has(name)){walk(el);el.replaceWith(...el.childNodes);continue;}
 for(const a of [...el.attributes]){const n=a.name.toLowerCase(),v=a.value.trim();
  if(n.startsWith('on')||n==='srcdoc'||n==='formaction')el.removeAttribute(a.name);
  else if((n==='href'||n==='xlink:href')&&!v.startsWith('#'))el.removeAttribute(a.name);
  else if(n==='src'&&!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v))el.removeAttribute(a.name);
  else if(n==='style'&&!safeCss(v))el.removeAttribute(a.name);}
 if(name==='style'){const svg=el.closest('svg');if(!svg||!safeCss(el.textContent)){el.remove();continue;}svg.id||=`q-svg-${++scope}`;el.textContent=scopeCss(el.textContent,svg.id);continue;}
 walk(el);}}
// MathML Core (Chrome, Edge) dropped <mfenced>; rebuild it as explicit <mo> delimiters.
function unfence(root){for(const f of [...root.querySelectorAll('mfenced')].reverse()){const mk=t=>{const mo=document.createElementNS(MATHML,'mo');mo.textContent=t;return mo;};const row=document.createElementNS(MATHML,'mrow'),seps=(f.getAttribute('separators')??',').replace(/\s/g,''),kids=[...f.children];row.append(mk(f.getAttribute('open')??'('));kids.forEach((k,i)=>{if(i&&seps)row.append(mk(seps[Math.min(i-1,seps.length-1)]));row.append(k);});row.append(mk(f.getAttribute('close')??')'));f.replaceWith(row);}}
export function clean(html){const doc=new DOMParser().parseFromString(`<div>${html||''}</div>`,'text/html'),root=doc.body.firstElementChild;walk(root);unfence(root);for(const img of root.querySelectorAll('img'))img.setAttribute('alt',img.getAttribute('alt')||'');for(const t of root.querySelectorAll('table'))t.classList.add('q-table');return root.innerHTML;}
