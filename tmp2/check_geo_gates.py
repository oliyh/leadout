#!/usr/bin/env python3
"""
Simulate lineCrossingCheck against every consecutive GPS pair in the GPX track.
Reports whether each line gate would have triggered, and how close the track got.
"""

import xml.etree.ElementTree as ET
import math

# ── Gates from school_programme.json ────────────────────────────────────────
GATES = [
    {
        "name": "End of WG",
        "q1_lat": 51.359388760370436, "q1_lng": 0.09712447176752903,
        "q2_lat": 51.359324163689905, "q2_lng": 0.09761712344698026,
    },
    {
        "name": "WRPS",
        "q1_lat": 51.36027412952359,  "q1_lng": 0.090593252666622,
        "q2_lat": 51.360233320894935, "q2_lng": 0.09108781814575197,
    },
]

# ── Exact port of the Monkey C lineCrossingCheck ─────────────────────────────
def line_crossing_check(p1_lat, p1_lng, p2_lat, p2_lng,
                        q1_lat, q1_lng, q2_lat, q2_lng):
    cos_lat = math.cos(math.radians(q1_lat))
    k_lat = 111320.0
    k_lng = 111320.0 * cos_lat

    ax = (p1_lng - q1_lng) * k_lng
    ay = (p1_lat - q1_lat) * k_lat
    bx = (p2_lng - q1_lng) * k_lng
    by = (p2_lat - q1_lat) * k_lat
    cx = (q2_lng - q1_lng) * k_lng
    cy = (q2_lat - q1_lat) * k_lat

    dMx = bx - ax
    dMy = by - ay
    denom = dMx * cy - dMy * cx
    if denom == 0.0:
        return False, None, None

    t = (-ax * cy + ay * cx) / denom
    u = (-ax * dMy + ay * dMx) / denom
    return (0.0 <= t <= 1.0 and 0.0 <= u <= 1.0), t, u

def closest_to_seg_m(lat, lng, q1_lat, q1_lng, q2_lat, q2_lng):
    """Closest distance in metres from a point to the gate line segment."""
    cos_lat = math.cos(math.radians(q1_lat))
    k = 111320.0
    px = (lng  - q1_lng) * k * cos_lat
    py = (lat  - q1_lat) * k
    qx = (q2_lng - q1_lng) * k * cos_lat
    qy = (q2_lat - q1_lat) * k
    seg2 = qx*qx + qy*qy
    if seg2 == 0:
        return math.hypot(px, py)
    t = max(0.0, min(1.0, (px*qx + py*qy) / seg2))
    return math.hypot(px - t*qx, py - t*qy)

# ── Parse GPX ────────────────────────────────────────────────────────────────
tree = ET.parse("activity_22968613553.gpx")
root = tree.getroot()
ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
trkpts = root.findall('.//gpx:trkpt', ns)

coords = [(float(pt.get('lat')), float(pt.get('lon'))) for pt in trkpts]
print(f"Track points: {len(coords)}\n")

# ── Check each gate ──────────────────────────────────────────────────────────
for gate in GATES:
    name   = gate["name"]
    q1_lat, q1_lng = gate["q1_lat"], gate["q1_lng"]
    q2_lat, q2_lng = gate["q2_lat"], gate["q2_lng"]

    # Gate length in metres
    cos_lat = math.cos(math.radians(q1_lat))
    gate_len = math.hypot(
        (q2_lng - q1_lng) * 111320.0 * cos_lat,
        (q2_lat - q1_lat) * 111320.0
    )

    crossings = []
    dists = []

    for i in range(len(coords) - 1):
        p1_lat, p1_lng = coords[i]
        p2_lat, p2_lng = coords[i + 1]
        crossed, t, u = line_crossing_check(
            p1_lat, p1_lng, p2_lat, p2_lng,
            q1_lat, q1_lng, q2_lat, q2_lng
        )
        if crossed:
            crossings.append((i, t, u))

    for i, (lat, lng) in enumerate(coords):
        d = closest_to_seg_m(lat, lng, q1_lat, q1_lng, q2_lat, q2_lng)
        dists.append((d, i, lat, lng))
    dists.sort()

    print(f"Gate: {name}  (length {gate_len:.1f} m)")
    print(f"  Line: ({q1_lat:.6f},{q1_lng:.6f}) → ({q2_lat:.6f},{q2_lng:.6f})")
    if crossings:
        print(f"  ✅ CROSSED — {len(crossings)} crossing(s):")
        for idx, t, u in crossings[:5]:
            la, lo = coords[idx]
            print(f"    segment [{idx}→{idx+1}] t={t:.3f} u={u:.3f}  from ({la:.6f},{lo:.6f})")
    else:
        print(f"  ❌ NEVER CROSSED")
        d0, i0, la0, lo0 = dists[0]
        print(f"  Closest approach: {d0:.1f} m at point [{i0}] ({la0:.6f},{lo0:.6f})")
        print(f"  5 nearest GPS points:")
        for d, i, la, lo in dists[:5]:
            print(f"    [{i:4d}] {d:6.1f} m  ({la:.6f},{lo:.6f})")
    print()
