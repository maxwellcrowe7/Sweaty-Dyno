#!/usr/bin/env python3
"""
Reassign team numbers across every data file.

Edit TARGET below, then:  python3 tools/remap_teams.py

It reads the CURRENT team->manager mapping out of data/managers.json, works out
the old->new number shift, and rewrites every team reference in every data file.
Safe to re-run: it always maps from whatever is committed right now.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data'

# managerId -> team number.  <<< EDIT THIS <<<
TARGET = {
    'noah': 1,    # NoahG621      Noah Goossen
    'neal': 2,    # Nealb17       Neal Bhakta
    'alex': 3,    # alexrcrowe    Alex Crowe
    'andrew': 4,  # Andrewnissen1 Andrew Nissen
    'damon': 5,   # dweierke34    Damon Weierke
    'max': 6,     # maxcrowe      Max Crowe
    'sam': 7,     # kuti          Sam Kutina
    'tanner': 8,  # Tanner2431    Tanner Menge
    'tyler': 9,   # Gopherkid14   Tyler Waterson
    'matt': 10,   # 3bnet         Matt Ebnet
}

# Keys whose value is a team number (or null).
TEAM_KEYS = {'team', 'slotTeam', 'pickedBy', 'winner', 'claimedBy'}
# Keys whose value is a list of team numbers.
TEAM_LIST_KEYS = {'order', 'entrants'}
# Keys whose value is an object keyed BY team number.
TEAM_MAP_KEYS = {'totalsByTeam'}

FILES = ['bank', 'minigames', 'drafts', 'trades', 'stats']


def load(name):
    return json.loads((D / f'{name}.json').read_text(encoding='utf-8'))


def save(name, obj):
    (D / f'{name}.json').write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def walk(node, shift):
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if k in TEAM_KEYS and isinstance(v, int):
                out[k] = shift[v]
            elif k in TEAM_LIST_KEYS and isinstance(v, list) and all(isinstance(x, int) for x in v):
                out[k] = [shift[x] for x in v]
            elif k in TEAM_MAP_KEYS and isinstance(v, dict):
                out[k] = {str(shift[int(tk)]): tv for tk, tv in v.items()}
            else:
                out[k] = walk(v, shift)
        return out
    if isinstance(node, list):
        return [walk(x, shift) for x in node]
    return node


def main():
    mg = load('managers')
    ids = {m['id'] for m in mg['managers']}
    unknown = set(TARGET) - ids
    if unknown:
        sys.exit(f'TARGET names unknown managers: {sorted(unknown)}')
    if sorted(TARGET.values()) != sorted(t['number'] for t in mg['teams']):
        sys.exit('TARGET must assign exactly the existing set of team numbers, once each.')

    # current: managerId -> number (using each team's first owner)
    current = {t['ownership'][0]['managerId']: t['number'] for t in mg['teams']}
    missing = ids - set(current)
    if missing:
        sys.exit(f'Managers with no team: {sorted(missing)}')

    shift = {current[mid]: TARGET[mid] for mid in TARGET}
    changed = {o: n for o, n in shift.items() if o != n}
    if not changed:
        print('Team numbers already match TARGET — nothing to do.')
        return

    print('Old -> new:')
    inv = {v: k for k, v in current.items()}
    for o in sorted(changed):
        print(f'  T{o:<2} -> T{changed[o]:<2}  ({inv[o]})')

    for f in FILES:
        save(f, walk(load(f), shift))
        print(f'  rewrote data/{f}.json')

    for t in mg['teams']:
        t['number'] = shift[t['number']]
    mg['teams'].sort(key=lambda t: t['number'])
    save('managers', mg)
    print('  rewrote data/managers.json')
    print('\nDone. Re-run tools/build.py to refresh the single-file build.')


if __name__ == '__main__':
    main()
