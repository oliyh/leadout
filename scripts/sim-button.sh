#!/usr/bin/env bash
# Click a named button on the CIQ Simulator.
# Usage: sim-button.sh <button>
#   button: enter | up | down | esc | menu
#
# Button positions from fr265s/simulator.json, scaled to the live window.
# The device PNG is 571x785; the simulator window scales it to fill the
# available area with a ~50px menu bar at the top.
set -euo pipefail

BUTTON="${1:-esc}"

WIN=$(DISPLAY=:0 xdotool search --name "CIQ Simulator" 2>/dev/null | tail -1)
if [ -z "$WIN" ]; then
    echo "ERROR: CIQ Simulator window not found" >&2
    exit 1
fi

WIN_GEOM=$(DISPLAY=:0 xdotool getwindowgeometry "$WIN" 2>/dev/null)
WIN_X=$(echo "$WIN_GEOM" | grep Position | grep -o '[0-9]*' | sed -n '1p')
WIN_Y=$(echo "$WIN_GEOM" | grep Position | grep -o '[0-9]*' | sed -n '2p')
WIN_W=$(echo "$WIN_GEOM" | grep Geometry | grep -o '[0-9]*' | sed -n '1p')
WIN_H=$(echo "$WIN_GEOM" | grep Geometry | grep -o '[0-9]*' | sed -n '2p')

# Device PNG dimensions
PNG_W=571
PNG_H=785

# Scale factor (width-limited; device fills window width)
SCALE_NUM=$WIN_W
SCALE_DEN=$PNG_W

# Menu bar height (window height minus scaled device height, split ~50/48 top/bottom)
# menu_bar ≈ (WIN_H - WIN_W * PNG_H / PNG_W) / 2  (roughly half the non-device space)
MENU_BAR=$(python3 -c "print(max(0, ($WIN_H - $WIN_W * $PNG_H / $PNG_W) // 2))")

# Button centres in device PNG coords
case "$BUTTON" in
    enter) BX=520; BY=276 ;;   # centre of enter hitbox: 485+71/2, 220+112/2
    up)    BX=31;  BY=392 ;;   # centre of up hitbox:   15+32/2,  357+70/2
    down)  BX=65;  BY=521 ;;   # centre of down hitbox: 38+54/2,  488+67/2
    esc)   BX=517; BY=521 ;;   # centre of esc hitbox:  495+45/2, 485+72/2
    menu)  BX=31;  BY=392 ;;   # same as up but hold
    *)
        echo "ERROR: unknown button '$BUTTON'. Use: enter|up|down|esc|menu" >&2
        exit 1
        ;;
esac

# Convert to absolute screen coords
ABS_X=$(python3 -c "print($WIN_X + int($BX * $SCALE_NUM / $SCALE_DEN))")
ABS_Y=$(python3 -c "print($WIN_Y + $MENU_BAR + int($BY * $SCALE_NUM / $SCALE_DEN))")

echo "Clicking '$BUTTON' at screen ($ABS_X, $ABS_Y)"

# ydotool uses evdev — real kernel events, bypasses GTK synthetic-event filter.
# sg ensures the input group is active even before a re-login.
sg input -c "ydotool mousemove $ABS_X $ABS_Y; sleep 0.2; ydotool click 1"
