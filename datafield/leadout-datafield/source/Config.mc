// API_BASE is defined in source/release/Config.mc or source/sim/Config.mc
// depending on the jungle file used. See monkey-device.jungle and monkey-sim.jungle.

// Keep in sync with the version in manifest.xml when releasing.
const APP_VERSION = "0.12.0";

// ── Compact segment layout ───────────────────────────────────────────────────
// Segments live on the heap as positional Arrays (not Dictionaries) to minimise
// memory on small-RAM DataField devices — FR245 and other CIQ 3.3 watches give a
// DataField only ~32KB of heap, and a Dictionary per segment doubled the footprint
// at LAP press. compressProgramme() (Utils.mc) writes these arrays into Storage;
// the View reads them directly without expanding back to Dictionaries.
//
// Layout by kind (index 0):
//   time/distance: [kind, name, duration, distance, pace]
//   repeat:        [kind, exit_type, repeat_count, duration, distance]
//   line:          [kind, name, p1_lat, p1_lng, p2_lat, p2_lng, pace]
// pace == -1 means "no target pace" (avoids null inside arrays for old-SDK safety).

// Segment kinds (index 0 of every compact segment array).
const KIND_TIME     = 0;
const KIND_DISTANCE = 1;
const KIND_REPEAT   = 2;
const KIND_LINE     = 3;

// Repeat exit types (index REP_EXIT of a repeat segment array).
const EXIT_COUNT    = 0;
const EXIT_TIME     = 1;
const EXIT_DISTANCE = 2;

// Field indices — time / distance / line segments.
const SEG_KIND     = 0;
const SEG_NAME     = 1;  // valid for time, distance, and line
const SEG_DURATION = 2;  // time
const SEG_DISTANCE = 3;  // distance
const SEG_PACE     = 4;  // time / distance target pace (line pace is at LINE_PACE)

// Field indices — repeat segments.
const REP_EXIT     = 1;
const REP_COUNT    = 2;
const REP_DURATION = 3;
const REP_DISTANCE = 4;

// Field indices — line segments.
const LINE_P1LAT = 2;
const LINE_P1LNG = 3;
const LINE_P2LAT = 4;
const LINE_P2LNG = 5;
const LINE_PACE  = 6;
