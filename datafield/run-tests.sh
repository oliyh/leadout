#!/usr/bin/env bash
set -euo pipefail

DEVICE=fr265s_sim
PRG=/tmp/leadoutdatafield-test.prg

echo "==> Compiling..."
monkeyc \
  -f monkey-sim.jungle \
  -d "$DEVICE" \
  -o "$PRG" \
  -y /opt/developer.der \
  --unit-test

echo "==> Starting simulator..."
Xvfb :1 -screen 0 1280x1024x24 &
DISPLAY=:1 simulator > /dev/null 2>&1 &
sleep 8

echo "==> Running tests..."
monkeydo "$PRG" fr265s -t 2>&1 | tee /tmp/result.txt || true
cat /tmp/result.txt
grep -q "^PASSED" /tmp/result.txt
