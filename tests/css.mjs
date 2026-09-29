/* The stylesheet's braces balance. A stray `}` is not an error to a browser
   -- it silently swallows whichever rule comes next -- so nothing else in the
   suite would ever notice one. */
const src = readFile('css/style.css');
let depth = 0, line = 1, i = 0;
const stray = [];
while (i < src.length) {
  if (src.startsWith('/*', i)) {
    const j = src.indexOf('*/', i + 2);
    const end = j < 0 ? src.length : j + 2;
    line += (src.slice(i, end).match(/\n/g) || []).length;
    i = end; continue;
  }
  const c = src[i];
  if (c === '\n') line++;
  else if (c === '{') depth++;
  else if (c === '}') { if (--depth < 0) { stray.push(line); depth = 0; } }
  i++;
}
if (stray.length || depth) {
  print(`  FAIL stray } at line ${stray.join(', ') || '-'}; ${depth} block(s) left open`);
  throw new Error('css');
}
print('Stylesheet braces balance.');
