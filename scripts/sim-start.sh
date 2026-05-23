#!/usr/bin/env bash
# Launch the CIQ Simulator, push the app, and wait for it to be ready.
# Usage: sim-start.sh [prg_path] [device]
#   prg_path: path to .prg file (default: datafield/leadout-datafield/bin/leadoutdatafield-sim.prg)
#   device:   device ID for ciq-run (default: fr265s)
#
# WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1: suppress WebKit's subprocess sandbox
# which needs clone(CLONE_NEWUSER) — restricted inside Docker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PRG="${1:-$REPO_ROOT/datafield/leadout-datafield/bin/leadoutdatafield-sim.prg}"
DEVICE="${2:-fr265s}"

# Start simulator if not already running
if ! pgrep -x simulator > /dev/null; then
    DISPLAY=:0 GDK_BACKEND=x11 \
        LIBGL_ALWAYS_SOFTWARE=1 \
        WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 \
        ciq-simulator &
    echo "Waiting for simulator to start..."
    sleep 14
fi

# Push the app
DISPLAY=:0 ciq-run "$PRG" "$DEVICE"
echo "App pushed. Waiting for device to load..."
sleep 4

# Verify window exists
WIN=$(DISPLAY=:0 xdotool search --name "CIQ Simulator" 2>/dev/null | tail -1)
if [ -z "$WIN" ]; then
    echo "ERROR: Simulator window not found after push" >&2
    exit 1
fi
echo "Simulator ready. Window ID: $WIN"
