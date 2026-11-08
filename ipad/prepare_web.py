#!/usr/bin/env python3
"""Build an isolated iPad web bundle. Never modify the deployed public/ tree."""
import argparse
import base64
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

def build(destination):
    dest = Path(destination).resolve()
    if dest == ROOT or ROOT / 'public' == dest or ROOT / 'public' in dest.parents:
        raise ValueError('Refusing to overwrite web sources')
    dest.mkdir(parents=True, exist_ok=True)
    for name in ('core.js', 'content.js', 'storage.js', 'sync.js', 'tools.js', 'styles.css', 'favicon.svg'):
        shutil.copy2(ROOT / 'public' / name, dest / name)
    # Full metadata is necessary for validState/merge to preserve Mac Math progress.
    bank = json.loads((ROOT / 'public/bank/index.json').read_text())
    reading_ids = {q['id'] for q in bank if q['s'] == 'rw'}
    (dest / 'bank').mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'public/bank/index.json', dest / 'bank/index.json')
    for source in (ROOT / 'public/bank').glob('p*.json'):
        items = [q for q in json.loads(source.read_text()) if q['id'] in reading_ids]
        (dest / 'bank' / source.name).write_text(json.dumps(items, separators=(',', ':')))
    legacy = [q for q in json.loads((ROOT / 'public/questions.json').read_text()) if q['id'] in reading_ids]
    (dest / 'questions.json').write_text(json.dumps(legacy, separators=(',', ':')))
    needed = {Path(image).name for q in legacy for image in q['images']}
    (dest / 'questions').mkdir(exist_ok=True)
    found = set()
    for source in sorted((ROOT / 'asset-packs').glob('*.json')):
        for name, encoded in json.loads(source.read_text()).items():
            if name in needed:
                (dest / 'questions' / name).write_bytes(base64.b64decode(encoded, validate=True))
                found.add(name)
    if found != needed:
        raise ValueError('Missing Reading question images')

    app = (ROOT / 'public/app.js').read_text()
    def replace(old, new, count=1):
        nonlocal app
        actual = app.count(old)
        if actual != count:
            raise ValueError(f'Upstream app changed: expected {count} occurrences of {old!r}, got {actual}')
        app = app.replace(old, new)
    replace('import {SECTIONS,', 'import {SECTIONS as ALL_SECTIONS,')
    replace("const $=s=>", "const SECTIONS={rw:ALL_SECTIONS.rw};\nconst visibleQuestions=()=>questions.filter(q=>q.s==='rw');\nconst visibleAttempts=()=>state.attempts.filter(a=>byId.get(a.id)?.s==='rw');\nconst readingSession=s=>s?.options.section==='rw'&&s.ids.every(id=>byId.get(id)?.s==='rw');\nconst $=s=>")
    replace("['math','calc','Math'],", '')
    replace('<a href="#${id}" class="nav-item', '<a href="#${id}" aria-label="${label}" class="nav-item')
    replace('stats(questions,state.attempts)', 'stats(visibleQuestions(),state.attempts)')
    replace('statCards(questions)', 'statCards(visibleQuestions())')
    replace('state.attempts.length} answers', 'visibleAttempts().length} answers')
    replace('state.attempts.length} total attempts', 'visibleAttempts().length} total attempts')
    replace('state.attempts.length?attemptTable(state.attempts.slice(-6).reverse())', 'visibleAttempts().length?attemptTable(visibleAttempts().slice(-6).reverse())')
    replace('attempts=state.attempts.filter(a=>new Date', 'attempts=visibleAttempts().filter(a=>new Date')
    replace('list=state.attempts.filter(a=>', 'list=visibleAttempts().filter(a=>')
    replace('wrong=questions.filter(q=>', 'wrong=visibleQuestions().filter(q=>')
    replace('marked=questions.filter(q=>', 'marked=visibleQuestions().filter(q=>')
    replace('!v.complete&&(!section||', 'readingSession(v)&&!v.complete&&(!section||')
    replace('if(!state.sessions[activeKey]){', 'if(!readingSession(state.sessions[activeKey])){')
    replace('function resume(key){if(!state.sessions[key])return;', 'function resume(key){if(!readingSession(state.sessions[key]))return;')
    replace('function openSession(options,restart=false){', "function openSession(options,restart=false){if(options.section!=='rw')return;")
    replace('function workspace(){const s=state.sessions[activeKey];if(!s){', 'function workspace(){const s=state.sessions[activeKey];if(!readingSession(s)){')
    replace('async function inspect(id,at){tick();', "async function inspect(id,at){if(byId.get(id)?.s!=='rw')return;tick();")
    replace('function showCalc(open){', 'function showCalc(open){return;')
    replace('function reference(){', 'function reference(){return;')
    replace('Choose your pacing target. Math always uses the SAT average of 95 seconds per question.', 'Choose your Reading and Writing pacing target.')
    replace('${questions.length} official questions', '${visibleQuestions().length} official Reading and Writing questions')
    replace(' The graphing calculator is provided by Desmos.', '')
    replace("el.innerHTML=p?'✓ This browser has agreed to keep Reading Room data even when storage runs low.':'This browser may clear site data when storage runs low. <button class=\"text-button\" data-action=\"persist\">Ask to keep it</button>';", "el.textContent='Saved on this iPad. Export a backup before deleting the app.';")
    replace("Progress stays on this device and browser: it does not sync to other devices, and clearing this site's browser data removes it, so export a backup now and then.", 'Progress is saved on this iPad and syncs when you connect the same code used on your Mac. Export a backup before deleting the app.')
    # Ignore replies from an old code/endpoint if the user changes connection mid-request.
    replace("async function syncNow(){const code=syncCode();if(!code||corruptRaw||syncing)return;", "let connectionGeneration=0;\nasync function syncNow(){const generation=connectionGeneration,code=syncCode();if(!questions.length||!code||corruptRaw||syncing)return;")
    replace("  if(remote&&!other)throw", "  if(code!==syncCode()||generation!==connectionGeneration)return;\n  if(remote&&!other)throw")
    replace("finally{syncing=false;showSync();}", "finally{syncing=false;showSync();if(code!==syncCode()||generation!==connectionGeneration)scheduleSync(0);}")
    # Sync credentials never enter URLs or backups. The native bridge makes only /api/sync requests.
    replace("setSyncCode(code);render();syncNow()", "if(!setSyncCode(code)){toast('Could not save the sync code.');break;}render();syncNow()")
    replace("navigator.clipboard?.writeText(formatCode(syncCode()))", "window.webkit.messageHandlers.clipboard.postMessage(formatCode(syncCode()))")
    start = app.index('function exportBackup(){')
    end = app.index('\nfunction replaceState(', start)
    app = app[:start] + "function exportBackup(){window.webkit.messageHandlers.backup.postMessage(corruptRaw||JSON.stringify(state,null,2)).catch(()=>toast('Backup could not be exported.'));}" + app[end:]
    app += "\nwindow.addEventListener('native-active',()=>{lastTick=performance.now();syncNow();});\nwindow.addEventListener('native-save',()=>{tick();save(true);});\nwindow.addEventListener('native-connection',()=>{connectionGeneration++;try{localStorage.removeItem('reading-room-sync-meta');}catch{}syncNow();});\n"
    (dest / 'app.js').write_text(app)
    # Keep the upstream protocol and swap only its transport, with strict validation in Swift.
    sync = (dest / 'sync.js').read_text()
    old = "const res=await fetch(url,{...init,headers:{authorization:'Bearer '+code,...init.headers}});"
    assert sync.count(old) == 1
    sync = sync.replace(old, "const reply=await window.webkit.messageHandlers.sync.postMessage({code,path:url,method:init.method||'GET',body:init.body||''});const res=new Response(reply.status===204?null:reply.body,{status:reply.status,headers:reply.headers});")
    (dest / 'sync.js').write_text(sync)
    html = (ROOT / 'public/index.html').read_text().replace(' and Math', '').replace('<link rel="preconnect" href="https://www.desmos.com">', '')
    html = html.replace('<meta name="viewport" content="width=device-width,initial-scale=1">', '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">')
    html = html.replace('<meta name="theme-color"', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data:; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'"><meta name="theme-color"')
    (dest / 'index.html').write_text(html)
    with (dest / 'styles.css').open('a') as css:
        css.write('\n/* iPad bundle only: retain the Reading Room visual language. */\nbutton,.nav-item,.text-button{min-height:44px} .sections-grid{grid-template-columns:1fr} input{font-size:16px} .sidebar-bottom{flex-wrap:wrap}\n')
    return len(reading_ids), len(found)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    count, images = build(args.output)
    print(f'Bundled {count} Reading and Writing questions and {images} images.')
