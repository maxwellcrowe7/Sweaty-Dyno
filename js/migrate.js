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
  // the empire set-aside is an accrual now, not a payout row
  if (d.bank?.payouts) d.bank.payouts = d.bank.payouts.filter((p) => p.category !== 'empire');
  if (d.bank && !d.bank.empirePot) d.bank.empirePot = { claimedBy: null, claimedSeason: null, paidAmount: null };
  if (d.bank?.empirePot && !('paidAmount' in d.bank.empirePot)) d.bank.empirePot.paidAmount = null;

  // minigames gained per-season awards
  for (const s of Object.values(d.minigames?.seasons || {})) if (!s.awards) s.awards = [];

  // weekly scores gained a ceiling alongside actual points
  for (const w of d.stats?.weekly || []) if (!('maxPoints' in w)) w.maxPoints = null;

  return d;
}
