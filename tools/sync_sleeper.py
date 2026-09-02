#!/usr/bin/env python3
"""
Pull weekly scores and Max PF from Sleeper into data/stats.json.

Each week stores BOTH what the team actually scored (`points`) and what its best
possible lineup would have scored (`maxPoints`) -- the season Max PF is the sum
of the latter.

    python3 tools/sync_sleeper.py            # every configured season
    python3 tools/sync_sleeper.py 2025       # one season
    python3 tools/sync_sleeper.py --no-maxpf # scores only (skips the 5 MB player file)

League IDs come from data/league.json. Doing this from the CLI is nicer than the
in-app button for back-filling history: the player dictionary downloads once and
you get a diff printed before anything is written.
"""
import json, sys, urllib.request
from pathlib import Path

API = 'https://api.sleeper.app/v1'
ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data'

FLEX = {'FLEX': ['RB', 'WR', 'TE'], 'WRRB_FLEX': ['RB', 'WR'],
        'REC_FLEX': ['WR', 'TE'], 'SUPER_FLEX': ['QB', 'RB', 'WR', 'TE']}
SKIP = {'BN', 'IR', 'TAXI'}


def get(path):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)


def load(n):
    return json.loads((D / f'{n}.json').read_text(encoding='utf-8'))


def save(n, o):
    (D / f'{n}.json').write_text(json.dumps(o, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def roster_map(league_id, managers):
    """roster_id -> team number, matched on sleeperUserId then username."""
    users, rosters = get(f'/league/{league_id}/users'), get(f'/league/{league_id}/rosters')
    by_id = {m['sleeperUserId']: m for m in managers['managers'] if m.get('sleeperUserId')}
    by_name = {m['sleeperUsername'].lower(): m for m in managers['managers'] if m.get('sleeperUsername')}
    team_of = {t['ownership'][0]['managerId']: t['number'] for t in managers['teams']}
    out, unmatched, ids = {}, [], {}
    for u in users:
        m = by_id.get(u['user_id']) or by_name.get((u.get('display_name') or u.get('username') or '').lower())
        if m:
            ids[m['id']] = u['user_id']
        else:
            unmatched.append(u.get('display_name') or u.get('username'))
    uid_to_mgr = {v: k for k, v in ids.items()}
    for r in rosters:
        mid = uid_to_mgr.get(r['owner_id'])
        if mid:
            out[r['roster_id']] = team_of[mid]
    return out, unmatched, ids


def optimal(players_points, slots, pos_of):
    pool = sorted(({'pid': k, 'p': float(v or 0), 'pos': pos_of(k)} for k, v in players_points.items()),
                  key=lambda x: -x['p'])
    pool = [x for x in pool if x['pos']]
    opens = sorted(({'slot': s, 'acc': FLEX.get(s, [s])} for s in slots if s not in SKIP),
                   key=lambda x: len(x['acc']))
    used, total = set(), 0.0
    for s in opens:
        for x in pool:
            if x['pid'] not in used and x['pos'] in s['acc']:
                used.add(x['pid']); total += x['p']; break
    return round(total, 2)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    want_maxpf = '--no-maxpf' not in sys.argv

    league, managers, stats = load('league'), load('managers'), load('stats')
    ids = {s: i for s, i in league['sleeper']['leagueIds'].items() if i}
    if args:
        ids = {s: i for s, i in ids.items() if s in args}
    if not ids:
        sys.exit('No league IDs configured for those seasons (see data/league.json).')

    state = get('/state/nfl')
    players = None
    changed = False

    for season, lid in sorted(ids.items()):
        lg = get(f'/league/{lid}')
        slots = lg['roster_positions']
        last_reg = (lg.get('settings', {}).get('playoff_week_start') or 15) - 1
        if str(state['season']) == season and lg.get('status') != 'complete':
            last_reg = min(last_reg, max(0, int(state['week']) - 1))
        print(f"\n{season}  {lg['name']}  ({lg.get('status')})  -> weeks 1-{last_reg}")
        if last_reg < 1:
            print('  no completed weeks yet'); continue

        r2t, unmatched, uids = roster_map(lid, managers)
        print(f'  rosters matched: {len(r2t)}/{lg["total_rosters"]}'
              + (f'  UNMATCHED: {unmatched}' if unmatched else ''))
        if unmatched:
            print('  -> add those names to `aliases` in data/managers.json, then re-run.')

        for m in managers['managers']:
            if uids.get(m['id']) and m.get('sleeperUserId') != uids[m['id']]:
                m['sleeperUserId'] = uids[m['id']]; changed = True

        if want_maxpf and players is None:
            print('  downloading player dictionary (~5 MB, once)…')
            players = get('/players/nfl')

        def pos_of(pid):
            p = players.get(pid) if players else None
            return (p.get('position') or (p.get('fantasy_positions') or [None])[0]) if p else None

        weekly, maxpf = [], {}
        for wk in range(1, last_reg + 1):
            for m in get(f'/league/{lid}/matchups/{wk}'):
                t = r2t.get(m['roster_id'])
                if not t:
                    continue
                row = {'season': int(season), 'week': wk, 'team': t,
                       'points': round(float(m.get('points') or 0), 2),
                       'maxPoints': None, 'opponent': None, 'result': None}
                if want_maxpf and m.get('players_points'):
                    best = optimal(m['players_points'], slots, pos_of)
                    row['maxPoints'] = best
                    maxpf[t] = round(maxpf.get(t, 0) + best, 2)
                weekly.append(row)

        before = len([w for w in stats['weekly'] if w['season'] == int(season)])
        stats['weekly'] = [w for w in stats['weekly'] if w['season'] != int(season)] + weekly
        print(f'  weekly scores: {before} -> {len(weekly)}')

        if maxpf:
            old = {m['team']: m['points'] for m in stats['maxPF'] if m['season'] == int(season)}
            stats['maxPF'] = [m for m in stats['maxPF'] if m['season'] != int(season)]
            for t, p in sorted(maxpf.items()):
                stats['maxPF'].append({'season': int(season), 'team': t, 'points': p})
                if t in old and abs(old[t] - p) > 0.01:
                    print(f'    T{t} max PF {old[t]} -> {p}')
            print(f'  max PF: {len(maxpf)} teams')
        changed = True

    if not changed:
        print('\nNothing to write.'); return
    stats['weekly'].sort(key=lambda w: (w['season'], w['week'], w['team']))
    stats['maxPF'].sort(key=lambda m: (m['season'], m['team']))
    stats['lastSleeperSync'] = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')
    save('stats', stats); save('managers', managers)
    print('\nWrote data/stats.json and data/managers.json.')
    print('Re-run tools/build.py to refresh the single-file build.')


if __name__ == '__main__':
    main()
