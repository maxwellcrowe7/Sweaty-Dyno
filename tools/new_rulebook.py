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
sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import Store, banner


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('season', type=int)
    ap.add_argument('--from', dest='src', type=int, default=None)
    ap.add_argument('--summary', default=None)
    ap.add_argument('--publish', action='store_true')
    ap.add_argument('--local', action='store_true', help='write data/*.json instead of the database')
    a = ap.parse_args()

    store = Store(prefer_local='--local' in sys.argv)
    banner(store)
    d = store.load()['rules']
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
    store.save('rules', d)
    store.commit()

    n = sum(len(s['items']) for s in base['sections'])
    print(f"Created {a.season} from {src}: {len(base['sections'])} sections, {n} rules.")
    print(f"  status: {'published' if a.publish else 'draft (only a signed-in commissioner sees it)'}")
    print(f'\nWritten to {store.where}. Edit it in the app under Rules,')
    print(f'or in data/rules.json if you are working offline. The diff against {src}')
    print('is generated automatically.')


if __name__ == '__main__':
    main()
