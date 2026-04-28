/**
 * Watch-facing API contract.
 *
 * Defines the exact wire format for the two endpoints the Garmin data field uses:
 *   GET  /api/sync/:device_code   → SyncResponse (200 or 404)
 *   POST /api/sessions/start      → Participation (201)
 *
 * Server acceptance tests (server/src/__tests__/acceptance.test.js) import the
 * validators here and apply them to actual HTTP responses.
 *
 * The Monkey C mirror in
 *   datafield/leadout-datafield/source/tests/leadout_datafieldTest.mc
 * embeds equivalent Dictionary fixtures using the same field names. If either
 * side renames a field, both sets of tests break — making divergence visible.
 *
 * Field name reference — what the watch reads from each object:
 *   SyncResponse:  programmes (Array), subscription_count (Number)
 *   Programme:     id (String), name (String), scheduled_date (String YYYY-MM-DD),
 *                  blocks (Array), pace_assumption (Number, seconds/km)
 *   Block:         name (String), segments (Array)
 *   Segment:       name (String), kind ("time"|"distance"),
 *                  duration (Number, seconds — time segments),
 *                  distance (Number, metres — distance segments),
 *                  target_pace (Number seconds/km | null)
 *   ParticipationRequest:  device_code (String), programme_id (String)
 */

// ── 404 response ──────────────────────────────────────────────────────────────

export const SYNC_404_BODY = { error: 'registration_required' };

// ── Programme fixture ─────────────────────────────────────────────────────────
// A minimal valid programme as returned inside the sync 200 response.
// scheduled_date is set to a far-future date; tests substitute today's date
// where findTodaysProgramme must return a result.

export const PROGRAMME_FIXTURE = {
    id:              'prog-contract-001',
    name:            'Tuesday Intervals',
    scheduled_date:  '2099-01-01',
    pace_assumption: 330,
    blocks: [
        {
            name: 'Warm up',
            segments: [
                { name: 'Easy jog', kind: 'time',     duration: 300, distance: 0,   target_pace: null },
            ],
        },
        {
            name: 'Intervals',
            segments: [
                { name: 'Fast',     kind: 'time',     duration: 120, distance: 0,   target_pace: 240  },
                { name: 'Recovery', kind: 'distance', duration: 0,   distance: 200, target_pace: null },
            ],
        },
    ],
};

// ── Sync 200 response ─────────────────────────────────────────────────────────

export const SYNC_200_BODY = {
    programmes:         [PROGRAMME_FIXTURE],
    subscription_count: 1,
};

// ── Participation ─────────────────────────────────────────────────────────────
// Request body the watch POSTs at LAP-press (block 0) and on participation retry.

export const PARTICIPATION_REQUEST = {
    device_code:  'WATCH-CONTRACT-01',
    programme_id: 'prog-contract-001',
};

// ── Validators ────────────────────────────────────────────────────────────────
// Apply these to actual server responses in acceptance tests.

export function assertSyncResponse200(body) {
    if (!Array.isArray(body.programmes))
        throw new Error(`sync 200: programmes must be Array (got ${typeof body.programmes})`);
    if (typeof body.subscription_count !== 'number')
        throw new Error(`sync 200: subscription_count must be number (got ${typeof body.subscription_count})`);
}

export function assertSyncResponse404(body) {
    if (body.error !== 'registration_required')
        throw new Error(`sync 404: error must be 'registration_required' (got '${body.error}')`);
}

export function assertProgrammeShape(p) {
    for (const field of ['id', 'name', 'scheduled_date', 'blocks']) {
        if (p[field] === undefined)
            throw new Error(`programme missing required field '${field}'`);
    }
    if (!Array.isArray(p.blocks))
        throw new Error(`programme.blocks must be Array (got ${typeof p.blocks})`);
    if (typeof p.scheduled_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.scheduled_date))
        throw new Error(`programme.scheduled_date must be YYYY-MM-DD (got '${p.scheduled_date}')`);
}

export function assertBlockShape(b) {
    if (typeof b.name !== 'string')
        throw new Error(`block.name must be string (got ${typeof b.name})`);
    if (!Array.isArray(b.segments))
        throw new Error(`block.segments must be Array (got ${typeof b.segments})`);
}

export function assertSegmentShape(s) {
    if (typeof s.name !== 'string')
        throw new Error(`segment.name must be string (got ${typeof s.name})`);
    if (s.kind !== 'time' && s.kind !== 'distance')
        throw new Error(`segment.kind must be 'time' or 'distance' (got '${s.kind}')`);
    if (s.kind === 'time' && typeof s.duration !== 'number')
        throw new Error(`time segment.duration must be number (got ${typeof s.duration})`);
    if (s.kind === 'distance' && typeof s.distance !== 'number')
        throw new Error(`distance segment.distance must be number (got ${typeof s.distance})`);
}

export function assertParticipation201(body) {
    for (const field of ['id', 'device_id', 'programme_id', 'started_at']) {
        if (body[field] === undefined)
            throw new Error(`participation 201 missing field '${field}'`);
    }
    if (typeof body.programme_id !== 'string')
        throw new Error(`participation.programme_id must be string`);
    if (new Date(body.started_at).getTime() !== new Date(body.started_at).getTime())
        throw new Error(`participation.started_at must be a valid ISO timestamp`);
}
