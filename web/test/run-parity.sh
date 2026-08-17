#!/usr/bin/env bash
# Transpile the pure logic modules and run every parity harness against the live app's
# actual functions. Exits non-zero on any mismatch. Run from web/: bash test/run-parity.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p test/.parity
./node_modules/.bin/esbuild src/scoring.ts --format=esm --outfile=test/.parity/scoring.mjs >/dev/null
./node_modules/.bin/esbuild src/merge.ts --bundle --format=esm --outfile=test/.parity/merge.mjs >/dev/null
echo "== scoring ==";  node test/scoring.parity.mjs
echo "== merge ==";    node test/merge.parity.mjs
