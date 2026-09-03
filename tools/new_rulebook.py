#!/usr/bin/env python3
"""
Start next season's rulebook by copying the previous one.

    python3 tools/new_rulebook.py 2027
    python3 tools/new_rulebook.py 2027 --from 2026 --summary "Playoffs expand to 8"
    python3 tools/new_rulebook.py 2027 --publish     # skip the draft stage

Every rule keeps its `id` through the copy. That is what makes the diff useful:
edit a line and it reads as CHANGED, add one and it reads as NEW, rather than
the whole book looking rewritten.

The same thing is available in the app under Rules -> "Start next season's
rulebook" if you would rather not use the terminal.
"""
import argparse, copy, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / 'data' / 'rules.json'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('season', type=int)
    ap.add_argument('--from', dest='src', type=int, default=None)
    ap.add_argument('--summary', default=None)
    ap.add_argument('--publish', action='store_true')
    a = ap.parse_args()

    d = json.loads(P.read_text(encoding='utf-8'))
    seasons = d['seasons']
    if str(a.season) in seasons:
        sys.exit(f'{a.season} already exists. Delete it from data/rules.json first, or edit it in the app.')

    src = a.src or max((int(s) for s in seasons), default=None)
    if src is None or str(src) not in seasons:
        sys.exit(f'No rulebook to copy from (looked for {src}).')

    base = seasons[str(src)]
    seasons[str(a.season)] = {
        'status': 'published' if a.publish else 'draft',
        'published': None,
        'basedOn': src,
        'summary': a.summary,
        'sections': copy.deepcopy(base['sections']),
    }
    P.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    n = sum(len(s['items']) for s in base['sections'])
    print(f"Created {a.season} from {src}: {len(base['sections'])} sections, {n} rules.")
    print(f"  status: {'published' if a.publish else 'draft (only a signed-in commissioner sees it)'}")
    print('\nNext: edit data/rules.json (or Rules -> Edit section in the app),')
    print('then run tools/build.py. The diff against '
          f'{src} is generated automatically.')


if __name__ == '__main__':
    main()
