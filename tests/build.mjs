// check.sh builds sweaty-dyno.html and then tests js/ -- which means the bundle
// itself was never checked. A multi-line import that tools/build.py failed to
// strip shipped a file that died on load with a blank page, and every suite
// still passed. This parses what the build actually produced.
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

const html = readFile('sweaty-dyno.html');
const m = html.match(/<script>\n(\/\* Single-file build[\s\S]*?)\n<\/script>/);
eq('the bundle is in there', Boolean(m), true);
const src = m ? m[1] : '';

// module syntax cannot survive into a classic <script>
eq('no import statements left', /^[ \t]*import\s[\s\S]{0,200}?\sfrom\s*['"]/m.test(src), false);
eq('no export statements left', /^[ \t]*export\s/m.test(src), false);

// new Function compiles the body without running it, so a syntax error throws here
let err = null;
try { new Function(src); } catch (e) { err = String(e); }
eq('the bundle parses', err, null);

eq('the data went in', src.includes('window.__SD_DATA'), true);
eq('and so did every view', ['minigames','drafts','rules','bank','empire','stats','transactions']
   .every((v) => src.includes(`js/views/${v}.js`) || src.includes(`${v}.js`)), true);

print(fail?`\n${fail} FAILURE(S)`:'\nBuild output is loadable.');
