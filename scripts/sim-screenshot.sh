#!/usr/bin/env bash
# Capture the CIQ Simulator window content to a file.
# Usage: sim-screenshot.sh <output.png>
set -euo pipefail

OUT="${1:-/tmp/sim.png}"
WIN=$(DISPLAY=:0 xdotool search --name "CIQ Simulator" 2>/dev/null | tail -1)
if [ -z "$WIN" ]; then
    echo "ERROR: CIQ Simulator window not found" >&2
    exit 1
fi
DISPLAY=:0 import -window "$WIN" "$OUT"
echo "$OUT"
