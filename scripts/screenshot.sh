#!/usr/bin/env bash
# Takes a full-screen screenshot via the XDG desktop portal (GNOME Wayland).
# Saves to ~/Pictures/ and prints the file path.
# First run will show a one-time permission dialog.
set -euo pipefail

gdbus call --session \
    --dest org.freedesktop.portal.Desktop \
    --object-path /org/freedesktop/portal/desktop \
    --method org.freedesktop.portal.Screenshot.Screenshot \
    "" "{'interactive': <false>}" > /dev/null 2>&1

sleep 1
ls -t ~/Pictures/*.png | head -1
