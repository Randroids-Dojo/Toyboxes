#!/usr/bin/env bash
# The release gate: every check must pass before an automatic release.
#
#   scripts/autobuild/qa.sh
#
# Runs typecheck, unit tests and the build, then every scripted playtest
# against a fresh local dev server (memory store), then the update banner
# test against a production build. On success it records the commit in
# /tmp/toyboxes-qa-pass so release.ts knows this exact commit passed.

set -uo pipefail
cd "$(dirname "$0")/../.."
LOG=/tmp/toyboxes-qa
mkdir -p "$LOG"
rm -f /tmp/toyboxes-qa-pass
DEV_PID=''
PREVIEW_PID=''
stop_pid() {
  if [ -n "$1" ]; then
    kill "$1" 2>/dev/null || true
    wait "$1" 2>/dev/null || true
  fi
}
cleanup() {
  stop_pid "$DEV_PID"
  stop_pid "$PREVIEW_PID"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() {
  echo "QA FAILED: $1"
  [ -f "$2" ] && tail -40 "$2"
  exit 1
}
step() { echo "== $1"; }

if [ -n "$(git status --porcelain)" ]; then echo "QA needs a clean, committed tree"; exit 1; fi
SHA=$(git rev-parse HEAD)

step typecheck; npm run typecheck > "$LOG/typecheck.log" 2>&1 || fail typecheck "$LOG/typecheck.log"
step "unit tests"; npm test > "$LOG/unit.log" 2>&1 || fail "unit tests" "$LOG/unit.log"
step "native server ESM"; node --import tsx scripts/autobuild/esmcheck.ts > "$LOG/esm.log" 2>&1 || fail "native server ESM" "$LOG/esm.log"
step build; npm run build > "$LOG/build.log" 2>&1 || fail build "$LOG/build.log"

fresh_server() {
  stop_pid "$DEV_PID"
  DEV_PID=''
  node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5207 --strictPort > "$LOG/dev.log" 2>&1 &
  DEV_PID=$!
  for _ in $(seq 1 40); do
    kill -0 "$DEV_PID" 2>/dev/null || fail "dev server exited" "$LOG/dev.log"
    curl -fs -o /dev/null http://localhost:5207/ && return 0
    sleep 0.5
  done
  fail "dev server did not start" "$LOG/dev.log"
}

# Each line: [ENV=VALUE ...] script.ts [args]. Experience playtests add themselves to playtests.txt.
PLAYTESTS=("playtest.ts desktop" "playtest.ts phone" "padtest.ts" "admintest.ts" "arcadetest.ts")
while IFS= read -r line; do [ -n "$line" ] && [ "${line:0:1}" != "#" ] && PLAYTESTS+=("$line"); done < scripts/autobuild/playtests.txt

i=0
for t in "${PLAYTESTS[@]}"; do
  i=$((i + 1))
  fresh_server
  step "playtest: $t"
  name=$(echo "$t" | tr ' =/' '___')
  # shellcheck disable=SC2086
  envs=$(echo "$t" | grep -o '[A-Z_]*=[^ ]*' | tr '\n' ' ')
  cmd=$(echo "$t" | sed -E 's/[A-Z_]+=[^ ]+ //g')
  if ! env $envs npx tsx scripts/$cmd > "$LOG/$i-$name.log" 2>&1; then fail "playtest $t" "$LOG/$i-$name.log"; fi
  grep -q "ERRORS" "$LOG/$i-$name.log" && fail "page errors in $t" "$LOG/$i-$name.log"
done
stop_pid "$DEV_PID"
DEV_PID=''

step "update banner on a production build"
node node_modules/vite/bin/vite.js preview --port 4317 --strictPort > "$LOG/preview.log" 2>&1 &
PREVIEW_PID=$!
sleep 2
kill -0 "$PREVIEW_PID" 2>/dev/null || fail "preview server exited" "$LOG/preview.log"
npx tsx scripts/updatetest.ts > "$LOG/update.log" 2>&1 || fail "update banner" "$LOG/update.log"
stop_pid "$PREVIEW_PID"
PREVIEW_PID=''

echo "$SHA" > /tmp/toyboxes-qa-pass
echo "QA PASSED for $SHA (logs in $LOG, screenshots in /tmp/toyboxes-*)"
