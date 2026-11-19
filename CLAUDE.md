# CLAUDE.md

Guidance for Claude Code when working in this repository. `README.md` has the long-form detail. This is the short version of what matters when changing code.

## What this is

League site for the Sweaty Dyno dynasty fantasy football league: bank and buy-ins, empire pot, weekly minigames (incl. guillotine), rookie drafts, trades/waivers, stats with Sleeper sync, and a versioned rulebook. Static site, no framework, no npm. Hosted on GitHub Pages; read-public / commissioner-write data in Supabase.

## Source of truth vs. generated files

- `index.html` + `js/` + `css/` + `data/` are the source. Edit these.
- `sweaty-dyno.html` is **generated** by `python3 tools/build.py` (single-file build with data inlined). Never edit it by hand. Rebuild after any change to source.
- `index.html` needs a server (`start.command` or `python3 -m http.server 8000`); it won't run from `file://`.

## Checks

`./tools/check.sh` rebuilds `sweaty-dyno.html`, runs every `tests/*.mjs` suite and validates every `data/*.json`. Run it before pushing. If it fails, don't push. It needs macOS JavaScriptCore, so it only runs on the Mac.

## Layout

- `js/app.js` — router + chrome. `js/views/*.js` — one module per screen, `render(db, state)` (+ optional `mount()`).
- `js/db.js` — the data layer. **All reads and writes go through it.** Adapters: static JSON + localStorage overlay (no Supabase configured) or Supabase. Derived numbers (balances, standings, payouts) are selectors here, not stored values.
- `js/supabase.js` — hand-rolled auth (GoTrue) + data (PostgREST) client, no SDK. `js/config.js` — blank = JSON mode, filled = Supabase.
- `js/migrate.js` — upgrades older data shapes. Shape changes need a migration here, not an assumption that data is already new-shape.
- `js/sleeper.js` — Sleeper API client (public, keyless, called from the browser).
- `tools/*.py` — build, team remapping, Sleeper sync, rulebook copy-forward, Supabase seeding.

## Data rules that must not break

- **Team number is the permanent key.** Ownership changes are appended to a team's `ownership` array. Never edit or rewrite old entries; history must stay attached to the team.
- **Rule ids are stable across seasons.** The changed/new/removed tracking in the rulebook depends on it. New seasons are copied forward (`tools/new_rulebook.py`), never re-pasted.
- Empire payouts are `team: null, paid: false` on purpose (earmarked, not disbursed). Don't "fix" them.
- Minigame results write their own bank payout lines. Keep that link, so the bank never drifts from results.

## Supabase

- Project ("Personal Tools") is **shared with other apps**. Everything here is prefixed `sweaty_dyno_`. Never touch other tables.
- Tables: `sweaty_dyno_data` (public read, admin-only insert/update, no delete), `sweaty_dyno_history` (snapshot of every change, public read), `sweaty_dyno_admins` (write allowlist). Writes are gated by `sweaty_dyno_is_admin()`, not by "signed in". Other tools allow sign-ups, so "authenticated" must never mean "can write".
- SQL lives in `supabase/schema.sql` and `supabase/02_grants_and_admin.sql`. The user runs SQL manually in the Supabase editor, so any database change must also be saved into these files (or a new numbered file).
- Only the anon key goes in `js/config.js`. The `service_role` key is for `tools/seed_supabase.py` in a shell only. Never commit it.
