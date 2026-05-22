#!/usr/bin/env python3
"""
Check the 5-second debounce window for each gate crossing,
and whether a line segment's duration field is used as a fallback timeout.
"""
import xml.etree.ElementTree as ET
import math
from datetime import datetime, timezone

GATES = [
    {"name": "End of WG",  "segment": 0, "block": 0,
     "q1_lat": 51.359388760370436, "q1_lng": 0.09712447176752903,
     "q2_lat": 51.359324163689905, "q2_lng": 0.09761712344698026},
    {"name": "WRPS",       "segment": 3, "block": 0,
     "q1_lat": 51.36027412952359,  "q1_lng": 0.090593252666622,
     "q2_lat": 51.360233320894935, "q2_lng": 0.09108781814575197},
]

def lcc(p1la,p1lo,p2la,p2lo,q1la,q1lo,q2la,q2lo):
    c=math.cos(math.radians(q1la)); k=111320.0
    ax=(p1lo-q1lo)*k*c; ay=(p1la-q1la)*k
    bx=(p2lo-q1lo)*k*c; by=(p2la-q1la)*k
    cx=(q2lo-q1lo)*k*c; cy=(q2la-q1la)*k
    dMx=bx-ax; dMy=by-ay; den=dMx*cy-dMy*cx
    if den==0: return False
    t=(-ax*cy+ay*cx)/den; u=(-ax*dMy+ay*dMx)/den
    return 0<=t<=1 and 0<=u<=1

tree=ET.parse("activity_22968613553.gpx")
ns={'gpx':'http://www.topografix.com/GPX/1/1'}
pts=[(float(p.get('lat')),float(p.get('lon'))) for p in tree.getroot().findall('.//gpx:trkpt',ns)]
times=[datetime.fromisoformat(p.find('gpx:time',ns).text.replace('Z','+00:00'))
       for p in tree.getroot().findall('.//gpx:trkpt',ns)]

t0 = times[0]
print(f"Activity start: {t0}")
print(f"Activity end:   {times[-1]}")
print(f"Duration:       {(times[-1]-t0).total_seconds()/60:.1f} min")
print()

for gate in GATES:
    name=gate["name"]
    q1la,q1lo,q2la,q2lo=gate["q1_lat"],gate["q1_lng"],gate["q2_lat"],gate["q2_lng"]

    crossings=[]
    for i in range(len(pts)-1):
        if lcc(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],q1la,q1lo,q2la,q2lo):
            crossings.append(i)

    print(f"Gate: {name}  (block {gate['block']} seg {gate['segment']})")
    for idx in crossings:
        elapsed = (times[idx]-t0).total_seconds()
        print(f"  Crossed at point [{idx}]  T+{elapsed:.0f}s  ({times[idx].strftime('%H:%M:%S')})")
        print(f"  → To miss the 5s debounce, LAP must have been pressed AFTER T+{elapsed-5:.0f}s")
        print(f"    (if LAP pressed within 5s of this crossing, it would be blocked)")
    print()

print("="*60)
print("Key question: is `duration` on a line segment used as a timeout fallback?")
print("Looking at the code logic for kind==\"line\":")
print("  advance = lineCrossingCheck(...) only — NO duration timeout.")
print()
print("If 'End of WG' is never crossed, the programme is STUCK on segment 0 forever.")
print("WRPS would never even become the active segment.")
print()
print("The `duration: 60` on line segments is stored but NEVER used by the runtime.")
