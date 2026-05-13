#!/usr/bin/env bash
set -euo pipefail

DEVICE=${DEVICE:-fr265s}
DEVICE_SIM="${DEVICE}_sim"
PRG=/tmp/leadoutdatafield-test.prg

echo "==> Compiling for $DEVICE..."
monkeyc \
  -f monkey-sim.jungle \
  -d "$DEVICE_SIM" \
  -o "$PRG" \
  -y /opt/developer.der \
  --unit-test

echo "==> Starting simulator..."
Xvfb :1 -screen 0 1280x1024x24 &
DISPLAY=:1 simulator > /dev/null 2>&1 &
sleep 8

echo "==> Running tests on $DEVICE..."
monkeydo "$PRG" "$DEVICE" -t 2>&1 | tee /tmp/result.txt || true
cat /tmp/result.txt
grep -q "^PASSED" /tmp/result.txt
