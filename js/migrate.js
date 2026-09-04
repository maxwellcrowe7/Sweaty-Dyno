/* ============================================================
   MIGRATIONS
   Data can arrive from an older publish (Supabase still holding last
   week's shape) or from a stale export. Coerce it on load rather than
   letting the views do arithmetic on the wrong types — a boolean `paid`
   silently summing as $1 is worse than a loud failure.
   ============================================================ */
export function migrate(data) {
  const d = data || {};

  // buy-ins: { amount: 50, paid: true } -> { paid: 50 }
  if (d.bank?.payins) {
    for (const p of d.bank.payins) {
      if (typeof p.paid === 'boolean') p.paid = p.paid ? (Number(p.amount) || 0) : 0;
      else p.paid = Number(p.paid) || 0;
      delete p.amount;
      delete p.note;
      delete p.date;
    }
  }
  // Payout amounts used to be stored rows. They are derived now, so convert the
  // old rows into placement config plus a record of who was actually paid.
  if (d.bank?.payouts) {
    d.bank.settled ||= [];
    const seen = new Set(d.bank.settled.map((x) => `${x.season}:${x.category}:${x.team}`));
    d.league ||= {};
    d.league.placementPayouts ||= { default: {} };
    for (const p of d.bank.payouts) {
      if (p.category === 'empire') continue;              // an accrual, never a payout row
      if (p.category === 'placement' && p.place != null) {
        const scale = d.league.placementPayouts.default;
        if (scale[String(p.place)] == null) scale[String(p.place)] = p.amount;
      }
      const key = `${p.season}:${p.category}:${p.team}`;
      if (p.paid && p.team && !seen.has(key)) {
        seen.add(key);
        d.bank.settled.push({ season: p.season, category: p.category, team: p.team, date: null });
      }
    }
    delete d.bank.payouts;
  }
  if (d.bank && !d.bank.settled) d.bank.settled = [];

  // A legacy season holds only per-team totals. Keep it: it is the sole record
  // of that season's winnings until the real week-by-week data is published,
  // and minigameWinnings() falls back to it rather than reporting $0.
  if (d.bank && !d.bank.empirePot) d.bank.empirePot = { claimedBy: null, claimedSeason: null, paidAmount: null };
  if (d.bank?.empirePot && !('paidAmount' in d.bank.empirePot)) d.bank.empirePot.paidAmount = null;

  // minigames gained per-season awards; the guillotine stopped storing its result
  for (const s of Object.values(d.minigames?.seasons || {})) {
    if (!s.awards) s.awards = [];
    const g = s.guillotine;
    if (!g) continue;
    g.overrides ||= [];
    // Chops used to be typed in. They are derived from the weekly scores now, so
    // carry any hand-entered ones across as overrides rather than dropping them.
    if (Array.isArray(g.eliminations) && g.eliminations.length && !g.overrides.length)
      g.overrides = g.eliminations.map((e) => ({ week: e.week, team: e.team }));
    delete g.eliminations;
    delete g.awardedInWeek;
    delete g.week;
  }

  // weekly scores gained a ceiling alongside actual points
  for (const w of d.stats?.weekly || []) if (!('maxPoints' in w)) w.maxPoints = null;

  return d;
}
