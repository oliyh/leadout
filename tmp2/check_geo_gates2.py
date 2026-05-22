#!/usr/bin/env python3
"""
Extended analysis:
1. Check Float32 truncation effect on gate coords
2. Check GPX timestamp density (smart-recording gaps)
3. Re-run crossing check with float32 gate coords
"""

import xml.etree.ElementTree as ET
import math
import struct
from datetime import datetime

GATES = [
    {"name": "End of WG",
     "q1_lat": 51.359388760370436, "q1_lng": 0.09712447176752903,
     "q2_lat": 51.359324163689905, "q2_lng": 0.09761712344698026},
    {"name": "WRPS",
     "q1_lat": 51.36027412952359,  "q1_lng": 0.090593252666622,
     "q2_lat": 51.360233320894935, "q2_lng": 0.09108781814575197},
]

def to_f32(v):
    return struct.unpack('f', struct.pack('f', v))[0]

def line_crossing_check(p1_lat, p1_lng, p2_lat, p2_lng,
                        q1_lat, q1_lng, q2_lat, q2_lng):
    cos_lat = math.cos(math.radians(q1_lat))
    k = 111320.0
    ax=(p1_lng-q1_lng)*k*cos_lat; ay=(p1_lat-q1_lat)*k
    bx=(p2_lng-q1_lng)*k*cos_lat; by=(p2_lat-q1_lat)*k
    cx=(q2_lng-q1_lng)*k*cos_lat; cy=(q2_lat-q1_lat)*k
    dMx=bx-ax; dMy=by-ay
    denom=dMx*cy-dMy*cx
    if denom==0: return False
    t=(-ax*cy+ay*cx)/denom
    u=(-ax*dMy+ay*dMx)/denom
    return 0<=t<=1 and 0<=u<=1

# Parse GPX with timestamps
tree = ET.parse("activity_22968613553.gpx")
root = tree.getroot()
ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
trkpts = root.findall('.//gpx:trkpt', ns)

coords = []
times  = []
for pt in trkpts:
    lat = float(pt.get('lat'))
    lon = float(pt.get('lon'))
    t_el = pt.find('gpx:time', ns)
    ts = datetime.fromisoformat(t_el.text.replace('Z','+00:00')) if t_el is not None else None
    coords.append((lat, lon))
    times.append(ts)

print(f"Track points: {len(coords)}")

# GPS sampling rate stats
if times[0]:
    gaps = []
    for i in range(1, len(times)):
        if times[i] and times[i-1]:
            gaps.append((times[i]-times[i-1]).total_seconds())
    gaps.sort()
    print(f"GPS gap stats: min={gaps[0]:.0f}s  median={gaps[len(gaps)//2]:.0f}s  max={gaps[-1]:.0f}s  p95={gaps[int(len(gaps)*0.95)]:.0f}s")
    big_gaps = [(i,g) for i,g in enumerate(gaps) if g > 5]
    if big_gaps:
        print(f"  Gaps >5s: {len(big_gaps)}")
        for i,g in big_gaps[:10]:
            print(f"    gap {g:.0f}s before point [{i+1}]  pos=({coords[i+1][0]:.6f},{coords[i+1][1]:.6f})")
print()

# Float32 truncation analysis
print("="*60)
print("Float32 truncation effect on gate coordinates")
print("="*60)
for gate in GATES:
    name = gate["name"]
    print(f"\n{name}:")
    for key in ["q1_lat","q1_lng","q2_lat","q2_lng"]:
        orig = gate[key]
        f32  = to_f32(orig)
        err_m = abs(orig - f32) * 111320.0
        print(f"  {key}: {orig:.10f} → {f32:.10f}  (error {err_m*1000:.1f} mm)")

    # Re-run with float32 coords
    q1la = float(to_f32(gate["q1_lat"]))
    q1lo = float(to_f32(gate["q1_lng"]))
    q2la = float(to_f32(gate["q2_lat"]))
    q2lo = float(to_f32(gate["q2_lng"]))

    crossings_f64 = 0
    crossings_f32 = 0
    for i in range(len(coords)-1):
        p1la,p1lo = coords[i]; p2la,p2lo = coords[i+1]
        if line_crossing_check(p1la,p1lo,p2la,p2lo, gate["q1_lat"],gate["q1_lng"],gate["q2_lat"],gate["q2_lng"]):
            crossings_f64 += 1
        if line_crossing_check(p1la,p1lo,p2la,p2lo, q1la,q1lo,q2la,q2lo):
            crossings_f32 += 1

    print(f"  Crossings with f64 coords: {crossings_f64}")
    print(f"  Crossings with f32 coords: {crossings_f32}  ← what the watch actually sees")

# Crossing timing relative to segment start
print()
print("="*60)
print("Crossing timing — would the 5s debounce block them?")
print("(Segment starts when LAP is pressed; we don't know exact time,")
print(" but we can check the GPS timestamp at each crossing)")
print("="*60)
for gate in GATES:
    name = gate["name"]
    q1la,q1lo,q2la,q2lo = gate["q1_lat"],gate["q1_lng"],gate["q2_lat"],gate["q2_lng"]
    print(f"\n{name}:")
    for i in range(len(coords)-1):
        p1la,p1lo = coords[i]; p2la,p2lo = coords[i+1]
        if line_crossing_check(p1la,p1lo,p2la,p2lo,q1la,q1lo,q2la,q2lo):
            t1 = times[i]
            print(f"  Crossing at segment [{i}→{i+1}]  time={t1}  pos=({p1la:.6f},{p1lo:.6f})")
