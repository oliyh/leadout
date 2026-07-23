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
# fr245's plain LCD skin segfaults under this container's virtual GPU unless Mesa
# software rendering is forced. fr265s's richer AMOLED skin needs a WebKitWebProcess
# renderer that instead relies on real GL/compositing, which forcing software
# rendering breaks — so only force it for the device(s) that need it.
if [ "$DEVICE" = "fr245" ]; then
  SIM_ENV="LIBGL_ALWAYS_SOFTWARE=1"
else
  SIM_ENV=""
fi
DISPLAY=:1 env $SIM_ENV simulator > /dev/null 2>&1 &
sleep 8

echo "==> Running tests on $DEVICE..."
monkeydo "$PRG" "$DEVICE" -t 2>&1 | tee /tmp/result.txt || true
cat /tmp/result.txt
grep -q "^PASSED" /tmp/result.txt
