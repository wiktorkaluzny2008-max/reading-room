"""Import a College Board question-bank export (sat_qbank_all.json) into Reading Room.

Usage: python3 -I scripts/import-qbank.py /path/to/sat_qbank_all.json

Writes public/bank/index.json (metadata for every question, including the original
public/questions.json collection), public/bank/pNN.json content packs for the new
questions, and an import manifest in imports/. Questions already in
public/questions.json are matched by answer-choice text and skipped, so existing
IDs and saved progress are preserved.
"""
import html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK_SIZE = 100
DIFFICULTY = {'E': 'Easy', 'M': 'Medium', 'H': 'Hard'}
SECTION = {'English': 'rw', 'Math': 'math'}
SKILL_FIX = {'Cross-text Connections': 'Cross-Text Connections'}
RW_DOMAINS = ['Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions']
RW_SKILLS = ['Central Ideas and Details', 'Command of Evidence', 'Inferences', 'Words in Context', 'Text Structure and Purpose',
             'Cross-Text Connections', 'Rhetorical Synthesis', 'Transitions', 'Boundaries', 'Form, Structure, and Sense']


def rw_domain(skill):
    i = RW_SKILLS.index(skill)
    return RW_DOMAINS[0 if i < 3 else 1 if i < 6 else 2 if i < 8 else 3]


def norm(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return re.sub(r'[^a-z0-9]', '', html.unescape(s).lower())


def plain(s):
    s = re.sub(r'<img[^>]*>', '[IMG]', s or '')
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def legacy_keys(rationale):
    m = re.match(r'The correct answer is (?:either )?([-−]?[0-9][0-9.,/]*)', plain(rationale))
    return [m.group(1).rstrip('.,').replace('−', '-')] if m else []


def convert(q):
    meta, detail = q['meta'], q['detail']
    skill = SKILL_FIX.get(meta['skill_desc'].strip(), meta['skill_desc'].strip())
    base = {'id': meta['questionId'], 's': SECTION[meta['section']], 'd': meta['primary_class_cd_desc'].strip(),
            'k': skill, 'l': DIFFICULTY[meta['difficulty']]}
    if 'legacy' in detail:
        lg = detail['legacy'][0]
        item = {'stimulus': lg.get('body', '') if lg.get('prompt') else '', 'stem': lg.get('prompt') or lg.get('body', ''),
                'explanation': lg['answer']['rationale']}
        if lg['answer']['style'] == 'Multiple Choice':
            letters = sorted(lg['answer']['choices'])
            correct = lg['answer'].get('correct_choice') or re.match(r'Choice ([A-D]) is correct', plain(lg['answer']['rationale'])).group(1).lower()
            item.update(type='mcq', choices=[lg['answer']['choices'][c]['body'] for c in letters], answer=letters.index(correct))
        else:
            item.update(type='spr', keys=legacy_keys(lg['answer']['rationale']))
    else:
        item = {'stimulus': detail.get('stimulus') or '', 'stem': detail['stem'], 'explanation': detail['rationale'],
                'type': detail['type']}
        if detail['type'] == 'mcq':
            item.update(choices=[o['content'] for o in detail['answerOptions']], answer='ABCD'.index(detail['correct_answer'][0]))
        else:
            item.update(keys=[k.strip() for k in detail['keys']])
    base['t'] = item['type']
    if item['type'] == 'mcq':
        base['a'] = item['answer']
    elif item['keys']:
        base['a'] = item['keys']
    return base, {'id': base['id'], **item}


def main(path):
    bank = json.loads(Path(path).read_text())
    old = json.loads((ROOT / 'public/questions.json').read_text())
    old_by_choices = {''.join(norm(c) for c in o['choices']): o['id'] for o in old}
    old_prefixes = [(o['id'], [norm(c)[:30] for c in o['choices']]) for o in old]
    # The start and a middle chunk of each passage: the start is sometimes extracted chart-axis text.
    old_passages = {o['id']: (lambda t: (t[:60], t[len(t) // 2:len(t) // 2 + 40]))(norm(o['passage'])) for o in old}
    in_text = lambda oid, text: any(chunk in text for chunk in old_passages[oid])

    index = [{'id': o['id'], 's': 'rw', 'd': rw_domain(o['skill']), 'k': o['skill'], 'l': o['difficulty'], 't': 'mcq',
              'a': o['answer'], 'p': -1} for o in old]
    items, matched = [], {}
    for q in bank:
        meta, item = convert(q)
        if meta['s'] == 'rw':
            joined = ''.join(norm(c) for c in item['choices'])
            text = norm(item['stimulus'] + item['stem'])
            # Short choices (e.g. transition words) repeat across questions, so those also need the passage to match.
            same = lambda oid: in_text(oid, text) or len(joined) >= 150
            hit = old_by_choices.get(joined) or next(
                (oid for oid, pre in old_prefixes if sum(p in joined for p in pre if p) >= 3 and in_text(oid, text)), None)
            if hit and same(hit):
                matched[meta['id']] = hit
                continue
        index.append(meta)
        items.append(item)

    out = ROOT / 'public/bank'
    out.mkdir(exist_ok=True)
    for f in out.glob('p*.json'):
        f.unlink()
    for n in range(0, len(items), PACK_SIZE):
        pack = items[n:n + PACK_SIZE]
        for it in pack:
            next(m for m in index if m['id'] == it['id'])['p'] = n // PACK_SIZE
        (out / f'p{n // PACK_SIZE:02d}.json').write_text(json.dumps(pack, ensure_ascii=False, separators=(',', ':')))
    (out / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))

    ungraded = [i['id'] for i in items if i['type'] == 'spr' and not i['keys']]
    manifest = {'source': Path(path).name, 'sourceQuestions': len(bank), 'matchedExisting': matched,
                'added': len(items), 'selfGradedQuestionIds': ungraded}
    (ROOT / 'imports/qbank-all.json').write_text(json.dumps(manifest, indent=1))
    print(f'{len(bank)} source questions: {len(matched)} already in the collection, {len(items)} added '
          f'({len(ungraded)} grid-in questions without a parsable key are self-graded). '
          f'{len(index)} questions in total, {(len(items) + PACK_SIZE - 1) // PACK_SIZE} content packs.')


if __name__ == '__main__':
    main(sys.argv[1])
