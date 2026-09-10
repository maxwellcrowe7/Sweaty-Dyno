#!/bin/bash
# Run every suite. Data files are read relative to the repo root, so run from there.
#   ./tools/check.sh
cd "$(dirname "$0")/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
[ -x "$JSC" ] || { echo "JavaScriptCore not found (macOS only). Suites need a JS engine."; exit 2; }

# Rebuild first. sweaty-dyno.html is what gets opened by double-clicking, so a
# stale one means looking at old code and wondering why a change did nothing.
python3 tools/build.py >/dev/null || { echo "  FAIL  build"; exit 1; }

fail=0
for f in tests/*.mjs; do
  name=$(basename "$f" .mjs)
  out=$("$JSC" -m "$f" 2>&1)
  last=$(echo "$out" | tail -1)
  if echo "$out" | grep -qiE "FAILURE|Exception|FAIL "; then
    printf '  \033[31mFAIL\033[0m %-14s %s\n' "$name" "$last"
    echo "$out" | grep -E "FAIL |Exception" | head -5 | sed 's/^/         /'
    fail=1
  else
    printf '  \033[32mok\033[0m   %-14s %s\n' "$name" "$last"
  fi
done

for j in data/*.json; do
  python3 -c "import json,sys;json.load(open('$j'))" 2>/dev/null || { echo "  FAIL  $j is not valid JSON"; fail=1; }
done
[ $fail -eq 0 ] && echo && echo "All suites passed." || { echo; echo "Something failed — do not push."; }
exit $fail
