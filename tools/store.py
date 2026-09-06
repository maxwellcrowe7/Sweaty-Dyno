#!/usr/bin/env python3
"""
One place for tools to read and write league data.

The database is the source of truth. If SUPABASE_URL and SUPABASE_SERVICE_KEY
are set, every tool reads and writes there directly, so nothing has to be
"pushed" afterwards. Without them the tools fall back to data/*.json, which is
only a seed and an offline snapshot.

    export SUPABASE_URL=https://YOURPROJECT.supabase.co
    export SUPABASE_SERVICE_KEY=...      # Settings -> API -> service_role

    from store import Store
    s = Store()
    data = s.load()
    s.save('bank', data['bank'])
"""
import json, os, sys, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
TABLE = 'sweaty_dyno_data'
FILES = ['league', 'managers', 'bank', 'minigames', 'drafts', 'trades', 'stats', 'players', 'rules']


class Store:
    def __init__(self, prefer_local=False):
        self.url = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
        self.key = os.environ.get('SUPABASE_SERVICE_KEY') or ''
        self.remote = bool(self.url and self.key) and not prefer_local
        self.data = {}
        self._dirty = set()

    @property
    def where(self):
        return 'the database' if self.remote else 'data/*.json'

    # ---------- http ----------
    def _req(self, method, path, body=None, headers=None):
        r = urllib.request.Request(self.url + path, method=method,
                                   data=json.dumps(body).encode() if body is not None else None)
        r.add_header('apikey', self.key)
        r.add_header('Authorization', f'Bearer {self.key}')
        r.add_header('Content-Type', 'application/json')
        for k, v in (headers or {}).items():
            r.add_header(k, v)
        try:
            with urllib.request.urlopen(r) as res:
                raw = res.read().decode()
                return json.loads(raw) if raw.strip() else None
        except urllib.error.HTTPError as e:
            sys.exit(f'{method} {path} -> {e.code}\n{e.read().decode()[:500]}')

    # ---------- read ----------
    def load(self):
        if self.remote:
            rows = self._req('GET', f'/rest/v1/{TABLE}?select=key,value')
            self.data = {r['key']: r['value'] for r in rows}
            missing = [f for f in FILES if f not in self.data]
            if missing:
                print(f'  note: not in the database yet: {", ".join(missing)} — reading those from data/')
                for f in missing:
                    p = DATA / f'{f}.json'
                    if p.exists():
                        self.data[f] = json.loads(p.read_text(encoding='utf-8'))
        else:
            for f in FILES:
                p = DATA / f'{f}.json'
                if p.exists():
                    self.data[f] = json.loads(p.read_text(encoding='utf-8'))
        return self.data

    # ---------- write ----------
    def save(self, key, value=None):
        if value is not None:
            self.data[key] = value
        self._dirty.add(key)

    def commit(self):
        """Write everything marked with save(). Returns the keys written."""
        if not self._dirty:
            return []
        keys = sorted(self._dirty)
        if self.remote:
            self._req('POST', f'/rest/v1/{TABLE}?on_conflict=key',
                      [{'key': k, 'value': self.data[k]} for k in keys],
                      {'Prefer': 'resolution=merge-duplicates,return=minimal'})
        else:
            for k in keys:
                (DATA / f'{k}.json').write_text(
                    json.dumps(self.data[k], indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        self._dirty.clear()
        return keys

    # ---------- snapshot ----------
    def snapshot_to_files(self):
        """Copy whatever is loaded into data/*.json — the offline build's source."""
        for k, v in self.data.items():
            (DATA / f'{k}.json').write_text(
                json.dumps(v, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        return sorted(self.data)


def banner(s):
    print(f'Reading and writing {s.where}.')
    if not s.remote:
        print('  (set SUPABASE_URL and SUPABASE_SERVICE_KEY to work against the database directly)')
