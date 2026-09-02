/* ============================================================
   SUPABASE — auth (GoTrue) + data (PostgREST), over plain fetch.
   No SDK, no build step, nothing to install.
   ============================================================ */
import { SUPABASE } from './config.js';

const SESSION_KEY = 'sweatydyno:session:v1';
const TABLE = 'sweaty_dyno_data';

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
};
const writeSession = (s) => {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); }
  catch { /* private mode */ }
};

/** Surface Supabase's own error text rather than a bare status code. */
async function fail(res, what) {
  let detail = '';
  try {
    const b = await res.json();
    detail = b.error_description || b.msg || b.message || b.error || b.hint || '';
  } catch { /* non-JSON body */ }
  throw new Error(detail || `${what} failed (${res.status})`);
}

export class Supabase {
  constructor({ url, anonKey } = SUPABASE) {
    this.url = String(url || '').replace(/\/+$/, '');
    this.key = anonKey;
    this.session = readSession();
    this.data = {};
    this._listeners = new Set();
  }

  /* ---------- auth ---------- */

  get user() { return this.session?.user ?? null; }
  get signedIn() { return Boolean(this.session?.access_token) && !this._expired(0); }

  onAuth(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { this._listeners.forEach((f) => f(this.signedIn)); }

  _expired(skewSeconds = 60) {
    const at = this.session?.expires_at;
    return !at || Date.now() / 1000 > at - skewSeconds;
  }

  _store(body) {
    this.session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
      user: body.user ? { id: body.user.id, email: body.user.email } : this.session?.user ?? null,
    };
    writeSession(this.session);
    this._emit();
    return this.session;
  }

  async signIn(email, password) {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) await fail(res, 'Sign in');
    return this._store(await res.json());
  }

  async signOut() {
    const token = this.session?.access_token;
    this.session = null; writeSession(null); this._emit();
    if (token) {
      // best effort — the local session is already gone either way
      fetch(`${this.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: this.key, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }

  /** Refresh a nearly-expired token; returns false if the session is unusable. */
  async ensureFresh() {
    if (!this.session?.refresh_token) return false;
    if (!this._expired()) return true;
    try {
      const res = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });
      if (!res.ok) throw new Error('refresh rejected');
      this._store(await res.json());
      return true;
    } catch {
      this.session = null; writeSession(null); this._emit();
      return false;
    }
  }

  /* ---------- adapter interface (matches JsonAdapter) ---------- */

  get _headers() {
    const h = { apikey: this.key, 'Content-Type': 'application/json' };
    h.Authorization = `Bearer ${this.signedIn ? this.session.access_token : this.key}`;
    return h;
  }

  async load() {
    if (this.session) await this.ensureFresh();
    const res = await fetch(`${this.url}/rest/v1/${TABLE}?select=key,value`, { headers: this._headers });
    if (!res.ok) await fail(res, 'Loading the league');
    const rows = await res.json();
    if (!rows.length) throw new Error('The sweaty_dyno_data table is empty — run tools/seed_supabase.py first.');
    this.data = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return this.data;
  }

  get(key) { return this.data[key]; }

  async set(key, value) {
    if (!this.signedIn && !(await this.ensureFresh()))
      throw new Error('Sign in as commissioner to save changes.');
    this.data[key] = value;
    const res = await fetch(`${this.url}/rest/v1/${TABLE}?on_conflict=key`, {
      method: 'POST',
      headers: { ...this._headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key, value }]),
    });
    if (!res.ok) await fail(res, 'Saving');
  }

  /** Supabase saves immediately, so nothing is ever pending locally. */
  dirtyKeys() { return []; }
  async revert() { await this.load(); }
  get live() { return true; }
}
