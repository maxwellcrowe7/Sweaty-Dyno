#!/usr/bin/env python3
"""
Push data/*.json into the Supabase `league_data` table.

    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_KEY=...          # Settings -> API -> service_role
    python3 tools/seed_supabase.py           # upload
    python3 tools/seed_supabase.py --pull    # download back into data/ (backup)
    python3 tools/seed_supabase.py --dry-run

The service_role key bypasses RLS, so it is needed for the initial seed.
Keep it in your shell only — never commit it, never put it in js/config.js.
"""
import json, os, sys, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data'
FILES = ['league', 'managers', 'bank', 'minigames', 'drafts', 'trades', 'stats', 'players']

URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_KEY') or ''


def req(method, path, body=None, headers=None):
    r = urllib.request.Request(URL + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None)
    r.add_header('apikey', KEY)
    r.add_header('Authorization', f'Bearer {KEY}')
    r.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> {e.code}\n{e.read().decode()[:600]}')


def main():
    if not URL or not KEY:
        sys.exit('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first (see the docstring).')

    if '--pull' in sys.argv:
        rows = req('GET', '/rest/v1/league_data?select=key,value')
        for r in rows:
            (D / f"{r['key']}.json").write_text(
                json.dumps(r['value'], indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            print(f"  pulled {r['key']}.json")
        print(f'\nWrote {len(rows)} files into data/. Re-run tools/build.py.')
        return

    payload = []
    for f in FILES:
        p = D / f'{f}.json'
        if not p.exists():
            sys.exit(f'Missing {p}')
        payload.append({'key': f, 'value': json.loads(p.read_text(encoding='utf-8'))})
        print(f'  {f:<10} {p.stat().st_size / 1024:6.1f} KB')

    if '--dry-run' in sys.argv:
        print('\nDry run — nothing sent.')
        return

    req('POST', '/rest/v1/league_data?on_conflict=key', payload,
        {'Prefer': 'resolution=merge-duplicates,return=minimal'})
    rows = req('GET', '/rest/v1/league_data?select=key,updated_at')
    print(f'\nUploaded {len(payload)} files. Table now holds {len(rows)} rows:')
    for r in sorted(rows, key=lambda x: x['key']):
        print(f"  {r['key']:<10} {r['updated_at']}")


if __name__ == '__main__':
    main()
