/* ============================================================
   BACKEND CONFIG

   Leave `url` blank and the app runs entirely off the JSON files in
   /data — which is exactly how it works today. Fill both in and it
   switches to Supabase: everyone reads live data, and signing in as
   commissioner writes straight to the database with no export step.

   The anon key is DESIGNED to be public — it only grants what your
   RLS policies allow, which here is read-only. Committing it is fine.
   Never put the service_role key here; that one bypasses RLS.
   ============================================================ */
export const SUPABASE = {
  url: 'https://vxykjkuqhtfrzfktymja.supabase.co',
  anonKey: 'sb_publishable_oq2u0mXKoALbSCFTWu-iJQ_q1dO_zmB',
};

export const isConfigured = () => Boolean(SUPABASE.url && SUPABASE.anonKey);
