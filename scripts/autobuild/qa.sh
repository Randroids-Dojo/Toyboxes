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
fail() {
  echo "QA FAILED: $1"
  [ -f "$2" ] && tail -40 "$2"
  pkill -f "vite --host 0.0.0.0" 2>/dev/null
  pkill -f "vite preview" 2>/dev/null
  exit 1
}
step() { echo "== $1"; }

if [ -n "$(git status --porcelain)" ]; then echo "QA needs a clean, committed tree"; exit 1; fi
SHA=$(git rev-parse HEAD)

step typecheck; npm run typecheck > "$LOG/typecheck.log" 2>&1 || fail typecheck "$LOG/typecheck.log"
step "unit tests"; npm test > "$LOG/unit.log" 2>&1 || fail "unit tests" "$LOG/unit.log"
step build; npm run build > "$LOG/build.log" 2>&1 || fail build "$LOG/build.log"

fresh_server() {
  pkill -f "vite --host 0.0.0.0" 2>/dev/null
  sleep 1
  (npx vite --host 0.0.0.0 > "$LOG/dev.log" 2>&1 &)
  for _ in $(seq 1 40); do curl -s -o /dev/null http://localhost:5207/ && return 0; sleep 0.5; done
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
pkill -f "vite --host 0.0.0.0" 2>/dev/null

step "update banner on a production build"
(npx vite preview --port 4317 > "$LOG/preview.log" 2>&1 &)
sleep 2
npx tsx scripts/updatetest.ts > "$LOG/update.log" 2>&1 || fail "update banner" "$LOG/update.log"
pkill -f "vite preview" 2>/dev/null

echo "$SHA" > /tmp/toyboxes-qa-pass
echo "QA PASSED for $SHA (logs in $LOG, screenshots in /tmp/toyboxes-*)"
