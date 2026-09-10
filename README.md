# Sweaty Dyno

League tool for the Sweaty Dyno dynasty fantasy football league. Bank and buy-ins,
the empire pot, weekly minigames (guillotine included), rookie draft boards,
trades and conditional trades, waiver claims, and stats with Sleeper sync.

Static site — no build step, no server. Runs as-is on GitHub Pages.

---

## Opening it

| I want to… | Do this |
|---|---|
| Just look at it, right now | Double-click **`sweaty-dyno.html`** — self-contained, works off the disk |
| Run the real app locally | Double-click **`start.command`** (or `python3 -m http.server 8000`) |
| Put it online | Push to GitHub, turn on Pages — see below |

**Do not** open `index.html` by double-clicking. Browsers block JavaScript modules and
local file reads on `file://` addresses, so you'd get a blank page. It now shows an
explanation instead of failing silently, but the two options above are the fix.

## Team numbers

| # | Sleeper | Manager | | # | Sleeper | Manager |
|---|---|---|---|---|---|---|
| 1 | NoahG621 | Noah Goossen | | 6 | maxcrowe | Max Crowe |
| 2 | Nealb17 | Neal Bhakta | | 7 | kuti | Sam Kutina |
| 3 | alexrcrowe | Alex Crowe | | 8 | Tanner2431 | Tanner Menge |
| 4 | Andrewnissen1 | Andrew Nissen | | 9 | Gopherkid14 | Tyler Waterson |
| 5 | dweierke34 | Damon Weierke | | 10 | 3bnet | Matt Ebnet |

Confirmed. The "Ebnet" and "Waterson" names from your Trade Tracker and waiver list are
Matt (T10) and Tyler (T9), so every trade side and waiver claim is now attributed.

Team number is the permanent key — to hand a team to a new owner, append to that team's
`ownership` array (see *Data model*). To renumber teams wholesale, edit `TARGET` in
`tools/remap_teams.py` and run it; it rewrites every team reference in every data file.

**Still needed: your Sleeper league ID(s).** Add them under Admin → Sleeper (or in
`data/league.json`), then hit *Sync scores* and *Compute Max PF*. Roster matching is
already wired to the usernames above.

---|---|---|---|---|---|---|
| 1 | NoahG621 | Noah | | 6 | maxcrowe | Max |
| 2 | Nealb17 | Neal | | 7 | kuti | Sam ⚠️ |
| 3 | alexrcrowe | Alex | | 8 | Tanner2431 | Tanner |
| 4 | Andrewnissen1 | Andrew | | 9 | Gopherkid14 | Tyler ⚠️ |
| 5 | dweierke34 | Damon | | 10 | 3bnet | Matt ⚠️ |

⚠️ The three marked rows are a **guess at the pairing**. The team numbers and usernames are
confirmed; what isn't is which of Sam / Tyler / Matt goes with `kuti`, `Gopherkid14` and
`3bnet`. Matt↔`3bnet` is inferred from `3bnet` = "Ebnet", who traded away Rashee Rice —
Matt's 2025 keeper. To correct any of it, edit `TARGET` in `tools/remap_teams.py` and run
it; it rewrites every team reference in every data file.

`3bnet` did resolve the **"Ebnet"** alias from your Trade Tracker — those four trade sides
now point at Team 10. **"Waterson"** is still unmatched (3 waiver claims); add it to the
right manager's `aliases` in `data/managers.json` when you know who it is.

**Still needed: your Sleeper league ID(s).** Add them under Admin → Sleeper (or in
`data/league.json`), then hit *Sync scores* and *Compute Max PF*.

---

## Deploying to GitHub Pages

The repo is already initialised and committed. Create an empty repo on GitHub
(no README, no .gitignore), then:

```bash
git remote add origin https://github.com/<you>/sweaty-dyno.git
git push -u origin main
```

Then **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.
Your site lands at `https://<you>.github.io/sweaty-dyno/` within a minute or two.

`.nojekyll` is already committed so the `js/` and `data/` folders serve correctly
(Jekyll would otherwise skip anything it doesn't recognise).

**Everything in this repo is public once you push**, including `js/config.js`. That is
fine — the anon key belongs there. Just never let the `service_role` key near a commit.

---

## How editing works

Hit **Admin → Edit mode**. That turns on, across the app:

- **Bank** — tap any buy-in cell to toggle paid/unpaid
- **Games** — set each week's minigame name, rules, payouts and 1st/2nd/3rd
  (with the free-text "what won it"); chop teams from the guillotine and crown the survivor
- **Trades** — log trades, conditional trades (open / met / expired), and waiver claims

Edits save to your browser immediately. They are **not** live for anyone else until you
**Admin → Download changed**, drop the files into `data/`, and commit. The Admin panel
shows a badge for every file with unexported changes, and *Discard local changes* rolls
back to whatever is committed.

Minigame results feed the bank automatically — logging a winner writes the matching
`minigame` payout line, so the balance sheet never drifts from the results.

---

## Data model

Everything lives in `data/*.json`. Each file has a `_README` key explaining its shape.

| File | Holds |
|---|---|
| `league.json` | seasons, buy-in and empire set-aside per season, empire scale, Sleeper IDs |
| `managers.json` | managers, aliases, and **teams with an ownership timeline** |
| `bank.json` | buy-ins, payout line items, empire points, season finishes |
| `minigames.json` | weekly slate per season, results, guillotine |
| `drafts.json` | rookie draft boards — slot owner vs. who actually picked |
| `trades.json` | trades, conditional trades, waiver claims |
| `stats.json` | weekly points, season Max PF |
| `players.json` | player → position, for the colour chips (best-effort, safe to edit) |

**Team number is the permanent key.** A team keeps its whole financial and draft history
through ownership changes. To hand Team 7 to someone new, add to that team's `ownership`
array — never edit the old entry:

```json
{ "number": 7, "name": null, "ownership": [
  { "managerId": "tyler",   "fromSeason": 2025, "toSeason": 2026 },
  { "managerId": "newguy",  "fromSeason": 2027, "toSeason": null }
]}
```

Add the new person to `managers` first. Historical rows stay attached to Team 7, and every
view resolves the right name for the season you're looking at.

### A note on the bank

Payouts in the `empire` category have `"team": null` and `"paid": false` on purpose —
that money is *earmarked, not disbursed*. It stays in the physical bank until someone
claims the pot. So:

```
cash on hand = buy-ins collected − payouts actually paid      ($1,100 − $320 = $780)
free cash    = cash on hand − empire earmark                  ($780 − $300 = $480)
```

That's why the app shows $780 with $300 locked, matching your spreadsheet exactly.

---

## Sleeper sync

Both leagues are wired up:

| Season | League ID | |
|---|---|---|
| 2026 | `1314450842367041536` | Sweaty Dyno v2 — in season |
| 2025 | `1221508258016014336` | complete (found via `previous_league_id`) |

Sleeper's read API is public, keyless and CORS-open, so **the browser calls it
directly**. No server, no proxy, no credentials — the sync code ships inside the app.

**It mostly looks after itself.** When you open the app signed in, anything new is
pulled and written to the database, at most once every six hours (`sleeper.autoSync`
and `autoSyncHours` in `league.json`). That covers weekly scores and, once the
playoffs are done, the final standings that drive placement payouts and empire points.

**Admin → Sync** does the same thing on demand. **Compute Max PF** is a separate
button because it downloads Sleeper's ~5 MB player file to work out each team's best
possible lineup; nothing runs that automatically.

Each week stores **both** what the team actually scored and what its best possible
lineup would have scored. Season Max PF is the sum of the latter — and it reproduces
all ten of your spreadsheet's Max PF figures to the cent, which is how the
optimal-lineup algorithm was validated.

For back-filling a whole season at once, the CLI is still nicer — the player file
downloads once and you see a diff first:

```bash
python3 tools/sync_sleeper.py            # every configured season
python3 tools/sync_sleeper.py 2026       # just one
python3 tools/sync_sleeper.py --no-maxpf # scores only
```

### What still needs a scheduler

Auto-sync only runs when *you* open the app. If the league should see fresh numbers
without you visiting, something has to run unattended — a GitHub Action on a cron, or
a Supabase scheduled function. That is the only remaining piece, and it is the only
thing that needs the service key.

> **Worth knowing:** the `Stats` tab in your original spreadsheet was recording *weekly
> Max PF*, not actual points — 9 of its 10 week-1/week-2 values match the computed
> ceiling exactly. (Alex week 2 read 173.80 where Sleeper gives 172.80, most likely a
> typo.) The app keeps both figures per week, so nothing is lost either way.

## Rulebook

One rulebook per season, at `data/rules.json`. The 2025 book is transcribed from
`2025 Sweaty Dyno Rules.pdf` — 14 sections, 159 rules.

**Reading it.** A contents rail runs down the side (a drawer on phones) and jumps to any
section, with a badge showing how many rules changed there this year. Sections and
individual rules are linkable:

```
#/rules?year=2026                    the 2026 book
#/rules?year=2026&tab=changes        just what changed
#/rules?year=2026&sec=waivers        jump to a section
#/rules?year=2026&item=waivers-faab  jump to one rule and flash it
```

**Writing next year's.** Copy the previous book forward, edit, publish:

```bash
python3 tools/new_rulebook.py 2027
```

or in the app: **Rules → Start next season's rulebook**. Either way it lands as a *draft*,
visible only to a signed-in commissioner, until you hit Publish.

**How changes get tracked.** Every rule carries a stable `id` that survives the copy. Edit
the text and it reads as **Changed**; add a line and it reads as **New**; delete one and it
shows under **Removed**. Changed rules get a word-level diff, so `$100` → `$125` shows
exactly those two words rather than repainting the paragraph. Managers can read the whole
book with changes marked inline, flip to **What changed** for just the deltas, or turn the
marks off entirely.

That only works because ids are preserved — which is why you should copy a season forward
rather than paste in fresh text.

## Supabase backend

Read is public; write requires the commissioner to sign in. The gate is enforced by
Postgres row-level security, not by the UI — a visitor poking at the API gets refused.

**Until you configure it, the app runs off the JSON files exactly as it does now.**
Nothing breaks if you never set this up.

### One-time setup

Designed to drop into an existing shared Supabase project. Every object is prefixed
`sweaty_dyno_`, write access is an explicit allowlist rather than "anyone signed in",
and no project-wide settings change — so your other tools are untouched.

1. **Run the schema** — SQL Editor → paste `supabase/schema.sql`.
   Before running, change `CHANGE-ME@example.com` near the bottom to the email you
   sign into Supabase with. Then Run. Safe to re-run.

2. **Confirm you're the commissioner** — uncomment and run the check query at the
   bottom of the file. It should return exactly one row: your email.

3. **Seed the data:**
   ```bash
   cd "/Users/mtcrowe/Desktop/Sweaty Dyno"
   export SUPABASE_URL=https://YOURPROJECT.supabase.co
   export SUPABASE_SERVICE_KEY=...        # Settings -> API -> service_role
   python3 tools/seed_supabase.py
   ```

4. **Point the app at it** — put the URL and the **anon** key in `js/config.js`, then:
   ```bash
   python3 tools/build.py
   git add -A && git commit -m "Connect Supabase" && git push
   ```

### Which key goes where

| Key | Where | Committed? |
|---|---|---|
| `anon` / publishable | `js/config.js` | **Yes** — it only grants what RLS allows, which is read-only |
| `service_role` | your shell, for seeding | **Never.** It bypasses RLS entirely |

The anon key being public is by design; it is not a password. Your data is protected by
the policies in `schema.sql`, so read those before loosening anything.

### What changes once it's live

- Admin shows a **Commissioner** sign-in instead of the local edit toggle
- Edits save to the database immediately — no export, no commit, no redeploy
- The league sees changes on their next refresh
- *Export* becomes an occasional offline backup rather than the save mechanism
- `python3 tools/seed_supabase.py --pull` downloads the live data back into `data/`

### Safety notes for a shared project

- Tables: `sweaty_dyno_data`, `sweaty_dyno_history`, `sweaty_dyno_admins`. Nothing else
  in your project is read, written, or altered.
- Writes require your user id to be in `sweaty_dyno_admins`. Being signed into the
  project is not enough, so other tools can keep sign-ups on.
- There is no delete policy — rows are only ever upserted.
- Every change snapshots the previous value into `sweaty_dyno_history` first, so a bad
  edit is recoverable (rollback query is at the bottom of `schema.sql`).

## Layout

```
index.html            shell (needs a server)
sweaty-dyno.html      generated single-file build (works off the disk)
start.command         double-click launcher
css/style.css         design system (dark, mobile-first)
js/app.js             router + chrome
js/db.js              data layer + derived selectors   ← swap point for Supabase
js/util.js            formatting, icons, modal
js/sleeper.js         Sleeper API client
js/views/*.js         one module per screen: render(db, state) [+ mount()]
data/*.json           the league
js/config.js          backend config — blank = local JSON, filled = Supabase
js/supabase.js        auth (GoTrue) + data (PostgREST), no SDK
supabase/schema.sql   table, RLS policies, history trigger
tools/build.py        regenerates sweaty-dyno.html
tools/remap_teams.py  reassigns team numbers across all data files
tools/sync_sleeper.py pulls weekly scores + Max PF from Sleeper
tools/seed_supabase.py  uploads data/ to Supabase (and --pull to get it back)
```

`index.html` + `js/` + `data/` is the source of truth. `sweaty-dyno.html` is generated —
**never edit it by hand**. After changing anything in `js/`, `css/` or `data/`:

```bash
python3 tools/build.py
```

Adding a screen: drop a module in `js/views/` exporting `render(db, state)`, then add one
line to the `VIEWS` map in `js/app.js`. `primary: true` puts it in the phone tab bar;
without it, it goes in the "More" sheet.

## Running the checks

```bash
./tools/check.sh
```

Twelve suites in `tests/`, run on JavaScriptCore (built into macOS, nothing to
install). They render every view, exercise the write paths, and reconcile the
derived figures against the source spreadsheet and the Sleeper data — for
example, the guillotine suite replays 2025 from the weekly scores and checks all
nine chops and the winner against the rulebook.

`tests/migrate.mjs` is the one to keep an eye on when changing a data shape: it
rebuilds the *old* shape and asserts the app still reads it correctly, which is
what stops a structural change from silently corrupting already-published data.

Run this before pushing.
