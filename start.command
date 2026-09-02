#!/bin/bash
# Double-click this to run the full (modular) app locally.
cd "$(dirname "$0")" || exit 1
PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "Sweaty Dyno -> http://localhost:$PORT"
echo "Close this window (or press Ctrl-C) to stop the server."
( sleep 1 && open "http://localhost:$PORT" ) &
python3 -m http.server $PORT
