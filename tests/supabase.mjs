// Exercise the Supabase adapter against a mocked GoTrue + PostgREST.
globalThis.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
const DB={league:{name:'Sweaty Dyno'},bank:{payins:[]}};
let calls=[], token='tok-1', refreshed=0;
globalThis.fetch=async(u,o={})=>{
  const url=String(u), m=o.method||'GET';
  calls.push(`${m} ${url.replace('https://x.supabase.co','')}`);
  const auth=(o.headers||{}).Authorization||'';
  if(url.includes('grant_type=password')){
    const b=JSON.parse(o.body);
    if(b.password!=='right') return {ok:false,status:400,json:async()=>({error_description:'Invalid login credentials'})};
    return {ok:true,json:async()=>({access_token:'tok-1',refresh_token:'ref-1',expires_in:3600,user:{id:'u1',email:b.email}})};
  }
  if(url.includes('grant_type=refresh_token')){ refreshed++; return {ok:true,json:async()=>({access_token:'tok-2',refresh_token:'ref-2',expires_in:3600,user:{id:'u1',email:'c@x.com'}})}; }
  if(url.includes('/auth/v1/logout')) return {ok:true,json:async()=>({})};
  if(m==='GET') return {ok:true,json:async()=>Object.entries(DB).map(([key,value])=>({key,value}))};
  if(m==='POST'&&url.includes('sweaty_dyno_data')){
    if(!auth.startsWith('Bearer tok')) return {ok:false,status:401,json:async()=>({message:'new row violates row-level security policy'})};
    for(const r of JSON.parse(o.body)) DB[r.key]=r.value;
    return {ok:true,json:async()=>null};
  }
  return {ok:false,status:404,json:async()=>({})};
};
const {Supabase}=await import('../js/supabase.js');
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

const sb=new Supabase({url:'https://x.supabase.co',anonKey:'anon'});
eq('starts signed out', sb.signedIn, false);
await sb.load();
eq('anonymous read works', sb.get('league').name, 'Sweaty Dyno');
eq('read used the anon key', calls.some(c=>c.startsWith('GET /rest/v1/sweaty_dyno_data')), true);

let threw=null; try{ await sb.set('bank',{x:1}); }catch(e){ threw=e.message; }
eq('write refused while signed out', threw, 'Sign in as commissioner to save changes.');

threw=null; try{ await sb.signIn('c@x.com','wrong'); }catch(e){ threw=e.message; }
eq('bad password surfaces server text', threw, 'Invalid login credentials');
eq('still signed out', sb.signedIn, false);

await sb.signIn('c@x.com','right');
eq('signed in', [sb.signedIn, sb.user.email], [true,'c@x.com']);
eq('session persisted', JSON.parse(localStorage.getItem('sweatydyno:session:v1')).user.email, 'c@x.com');

await sb.set('bank',{payins:[{team:1}]});
eq('write lands in the table', DB.bank.payins.length, 1);
eq('nothing pending locally', sb.dirtyKeys(), []);
eq('reports itself as live', sb.live, true);

// expired token -> silent refresh
sb.session.expires_at = Math.floor(Date.now()/1000) - 10;
await sb.set('league',{name:'v2'});
eq('expired token refreshed then wrote', [refreshed, DB.league.name], [1,'v2']);

// a session restored from another browser tab
const sb2=new Supabase({url:'https://x.supabase.co',anonKey:'anon'});
eq('session restored from storage', sb2.signedIn, true);

let events=[]; sb.onAuth(v=>events.push(v));
await sb.signOut();
eq('signed out', sb.signedIn, false);
eq('storage cleared', localStorage.getItem('sweatydyno:session:v1'), null);
eq('auth listeners fired', events, [false]);
print(fail?`\n${fail} FAILURE(S)`:'\nSupabase adapter: all checks passed.');
