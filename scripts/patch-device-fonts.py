#!/usr/bin/env python3
"""
Patch Garmin device simulator.json files to replace missing .cft font
references with Roboto-Regular.ttf, which is the only font available in
the devcontainer's Fonts directory.

Older devices (FR245, FR935, etc.) reference proprietary FNT_FR945_*.cft
files that are only distributed by the official Garmin SDK Manager.
The community devices.zip (matco/connectiq-tester) ships the simulator.json
but not the .cft files. Newer devices (FR265S, etc.) already use Roboto-Regular
natively, which is why they work and older ones don't.

Three differences between old and new device font entries:
  Old (FR245):  {"name": "xtiny", "filename": "FNT_FR945_CDPG_ROBOTO_13B"}
  New (FR265S): {"name": "xtiny", "filename": "Roboto-Regular", "size": 5.4258, "type": "ttf"}

1. "type": "ttf" — without it, the simulator appends ".cft" when resolving
   the font path, crashing even when the filename is already "Roboto-Regular".
2. "size" — without it, the simulator uses a tiny default, making text
   unreadably small. Sizes are in simulator-internal units derived from the
   FR265S reference device and scaled ~10% for the 240×240 FR245 display.

Usage:
    python3 scripts/patch-device-fonts.py [device_id ...]
    python3 scripts/patch-device-fonts.py          # patches all devices
    python3 scripts/patch-device-fonts.py fr245 fr245m
"""

import json
import os
import sys

DEVICES_DIR = os.path.expanduser("~/.Garmin/ConnectIQ/Devices")
FONTS_DIR = os.path.expanduser("~/.Garmin/ConnectIQ/Fonts")
FALLBACK_FONT = "Roboto-Regular"

# Font sizes in simulator-internal units.
# Derived from the FR265S simulator.json (327 PPI, 218×218 display) and scaled
# ~10% upward for older 240×240 devices like the FR245/FR935/FR945.
# The "system*" names are aliases for the same logical size as their base name.
FONT_SIZES: dict[str, float] = {
    "xtiny":            5.97,   # FR265S 5.4258 × 1.10
    "tiny":             7.96,   # FR265S 7.2344 × 1.10
    "small":            8.95,   # FR265S 8.1387 × 1.10
    "medium":          10.28,   # FR265S 9.3444 × 1.10
    "large":           11.94,   # FR265S 10.8515 × 1.10
    "numberMild":      17.57,   # FR265S 15.9759 × 1.10
    "numberMedium":    20.23,   # FR265S 18.3873 × 1.10
    "numberHot":       25.20,   # FR265S 22.9088 × 1.10
    "numberThaiHot":   27.85,   # FR265S 25.3203 × 1.10
    "glanceFont":       6.96,   # FR265S 6.3301 × 1.10
    "glanceNumberFont": 8.95,   # same as small
    "auxiliaryFont1":   7.90,   # FR265S 7.1862 × 1.10
    "auxiliaryFont2":   6.92,   # FR265S 6.2879 × 1.10
    "simExtNumber1":   13.26,   # FR265S 12.0573 × 1.10
    "simExtNumber2":   14.92,   # FR265S 13.5644 × 1.10
    "simExtNumber3":   22.88,   # FR265S 20.7988 × 1.10
}

# "system*" variants are aliases of their base names
_SYSTEM_ALIASES = {
    f"system{base[0].upper()}{base[1:]}": base
    for base in ["xtiny", "tiny", "small", "medium", "large",
                 "numberMild", "numberMedium", "numberHot", "numberThaiHot"]
}
FONT_SIZES.update({alias: FONT_SIZES[base] for alias, base in _SYSTEM_ALIASES.items()})


def font_exists(filename: str) -> bool:
    """Check if a font file exists in the Fonts directory (any extension)."""
    for ext in (".ttf", ".cft", ".otf", ""):
        if os.path.exists(os.path.join(FONTS_DIR, filename + ext)):
            return True
    return False


def patch_device(device_id: str) -> bool:
    sim_json = os.path.join(DEVICES_DIR, device_id, "simulator.json")
    if not os.path.exists(sim_json):
        print(f"  {device_id}: no simulator.json, skipping")
        return False

    with open(sim_json) as f:
        data = json.load(f)

    fonts_section = data.get("fonts", [])
    if not fonts_section:
        print(f"  {device_id}: no fonts section, skipping")
        return False

    font_replacements = {}
    type_fixes = 0
    size_fixes = 0

    for fontset in fonts_section:
        for font_entry in fontset.get("fonts", []):
            filename = font_entry.get("filename", "")

            # Replace missing .cft font filenames with the available TTF fallback
            if filename and not font_exists(filename) and filename != FALLBACK_FONT:
                font_replacements[filename] = FALLBACK_FONT
                font_entry["filename"] = FALLBACK_FONT

            if font_entry.get("filename") != FALLBACK_FONT:
                continue  # leave non-fallback entries alone

            # Add "type": "ttf" — without it the simulator appends ".cft"
            if font_entry.get("type") != "ttf":
                font_entry["type"] = "ttf"
                type_fixes += 1

            # Add "size" — without it text is rendered at an unreadably tiny default
            if "size" not in font_entry:
                name = font_entry.get("name", "")
                size = FONT_SIZES.get(name)
                if size is not None:
                    font_entry["size"] = size
                    size_fixes += 1

    if not font_replacements and not type_fixes and not size_fixes:
        print(f"  {device_id}: all fonts present, typed, and sized — no changes needed")
        return False

    with open(sim_json, "w") as f:
        json.dump(data, f, indent=2)

    if font_replacements:
        print(f"  {device_id}: replaced {len(font_replacements)} missing font filename(s):")
        for old, new in sorted(font_replacements.items()):
            print(f"    {old!r} -> {new!r}")
    if type_fixes:
        print(f"  {device_id}: added 'type: ttf' to {type_fixes} font entry/entries")
    if size_fixes:
        print(f"  {device_id}: added 'size' to {size_fixes} font entry/entries")
    return True


def main():
    if len(sys.argv) > 1:
        devices = sys.argv[1:]
    else:
        devices = sorted(os.listdir(DEVICES_DIR))

    print(f"Fonts directory: {FONTS_DIR}")
    print(f"Available fonts: {os.listdir(FONTS_DIR)}")
    print(f"Fallback font:   {FALLBACK_FONT}")
    print()

    patched = 0
    for device_id in devices:
        if patch_device(device_id):
            patched += 1

    print()
    print(f"Done. Patched {patched} device(s).")


if __name__ == "__main__":
    main()
