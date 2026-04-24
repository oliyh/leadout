# Leadout

Group Interval Training App

## Concept

Leadout is a Garmin smartwatch app that lets a fitness instructor publish a structured interval programme (e.g. '3 minutes fast, 2 minutes slow, repeat 5 times') which participants download in advance. At the session, everyone presses go simultaneously and their watches guide them through the intervals in sync — with vibration alerts at each transition.

The core use case is group running sessions where participants leave from home, meet at a location, and then run to a start point before beginning the interval session together. The app must work without a phone present during the run.

## Why This Doesn't Exist Yet

Existing solutions (TrainingPeaks, Garmin Coach, etc.) all support one-to-one coach-to-athlete programme delivery, but none support the 'whole class starts simultaneously' use case. There is no broadcast mechanism for real-time sync across watches. Leadout solves this with a download-in-advance + shared start trigger model.

## System Architecture

### Components

| Component | Description |
|---|---|
| Garmin Watch App | Data Field + Widget built in Monkey C (Connect IQ SDK) |
| Instructor Web UI | Browser-based programme builder and channel manager |
| Backend API | Lightweight REST server — 3 tables, ~5 endpoints |
| Garmin OAuth | Anonymous identity via Garmin Connect Developer Programme |

### Data Model

The server-side data model is intentionally minimal:

| Entity | Key Fields |
|---|---|
| Channel | id (UUID), garmin_user_id (instructor), created_at |
| Programme | id, channel_id, segments (JSON), published_at, expires_at |
| Subscription | device_token, channel_id |

### API Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | /channel | Instructor JWT | Create a new channel |
| POST | /channel/:id/programme | Instructor JWT | Publish a programme |
| GET | /channel/:id/latest | None | Fetch latest programme |
| POST | /subscribe | None | Register device to channel |
| GET | /device/:token/programmes | None | Fetch all subscribed programmes |

## Privacy & Anonymity

No personal information is collected. The system uses two types of anonymous identifiers:

- **Instructor identity**: Garmin OAuth userId — a stable hashed ID returned by Garmin's Connect Developer API after OAuth sign-in. No name or email ever stored.
- **Participant identity**: A randomly generated device token created on first app install. The server only knows 'device X is subscribed to channel Y'.

Programmes themselves contain no personal data — just segment definitions (duration, type, pace targets, optional GPS waypoints).

## User Journeys

### Instructor Setup (one time)

1. Instructor visits Leadout web UI
2. Clicks 'Sign in with Garmin' — OAuth flow, no account creation needed
3. Creates a channel (e.g. 'Tuesday Runs with Sarah') — gets a permanent shareable link
4. Pastes link into their club WhatsApp group

### Participant Subscription (one time)

1. Participant taps WhatsApp link on phone
2. Mobile webpage opens — shows channel name
3. Taps 'Sign in with Garmin' to authenticate
4. Server links their Garmin userId to the channel
5. First time they open the Leadout watch app: OAuth flow on watch triggers phone notification, user approves, watch receives device token
6. Watch is now subscribed and will sync automatically

### Weekly Programme (instructor, each session)

1. Instructor opens Leadout web UI
2. Builds programme: adds segments (time-based, distance-based, or GPS waypoint-based)
3. Publishes to channel — programme expires automatically after session

### Morning of Session (participant)

- Watch has already synced programme overnight (background sync, min. 5-minute intervals)
- If subscribed to multiple instructors: open Leadout widget on watch, or open Garmin Connect app on phone → Leadout settings → select tonight's session
- Start run as normal — Leadout Data Field shows 'WAITING — [programme name]'
- Run to meetup point

### Starting the Session

1. Instructor counts down: 3, 2, 1, go
2. Everyone presses lap button on their watch simultaneously
3. Interval sequence begins — watch vibrates and bleeps at each transition
4. Display shows: current segment name, countdown timer, next segment preview
5. Native run recording continues uninterrupted throughout

## Watch App Design

### App Type: Data Field + Widget

Leadout is built as two Connect IQ components that share Application.Storage:

| Component | Purpose | When Used |
|---|---|---|
| Data Field | Interval guidance during the run | Active during native run activity |
| Widget | Programme selection and sync status | Before the run, from watch face |

Using a Data Field rather than a Device App means the user's native run tracking (pace, distance, HR, GPS route) continues uninterrupted. Leadout adds guidance on top of an existing run — it does not replace it.

### Data Field States

| State | Display | Trigger to advance |
|---|---|---|
| No programme | 'No session loaded — open Leadout widget' | — |
| Waiting | 'WAITING — [programme name]' | Lap button press |
| Active | Segment name, countdown, next segment | Timer / GPS / distance |
| Complete | 'Session complete!' | — |

### Segment Types

| Type | Trigger | Use Case |
|---|---|---|
| Time-based | Timer expires | Spin class, gym intervals |
| Distance-based | e.g. 'run 400m' | Track sessions |
| Location-based (geofence) | Enter GPS radius around waypoint | 'Run to the park gate' |
| Pace-based | Maintain pace for duration | Speed work |

An instructor can mix segment types freely within a single programme. The geofence implementation uses `Position.Location.distanceTo()` to calculate distance to the target point, triggering at a configurable radius (default 30m).

### Map Display

On map-capable watches (Fenix 5X and later, Forerunner 9xx series), the Data Field can display a MapView with the route polyline and current position overlaid. On non-map watches, a schematic breadcrumb trail is drawn by projecting GPS coordinates onto the screen canvas.

### Programme Selection

If a user is subscribed to multiple instructors, they select tonight's programme via:

- **Watch Widget**: scrollable list of downloaded programmes, tap to select. Selection written to Application.Storage, read by Data Field on next update.
- **Phone (Garmin Connect App Settings)**: static channel preference (which instructor to default to). Better for one-time setup, not for dynamic per-night selection.

The Widget is the primary selection surface for per-session choices. App Settings handles persistent preferences.

## Security Model

| Actor | Identity | Permissions |
|---|---|---|
| Instructor | Garmin OAuth userId + signed JWT | Create channels, publish programmes to own channels only |
| Participant | Anonymous device token | Subscribe to channels, read programmes |
| Anyone | None | Read-only channel metadata if channel ID known — cannot write |

All endpoints served over HTTPS. Instructor JWT is a signed token issued after OAuth, verified server-side on each write operation. Channel IDs are UUIDs — effectively unguessable but not secret (they appear in WhatsApp links).

Optional enhancement: one-time join tokens in WhatsApp links that expire after 24 hours, preventing subscription by non-members.

## Background Sync

Connect IQ supports temporal background events for periodic tasks. Key constraints:

- Minimum interval between background events: 5 minutes
- Each background run limited to 30 seconds
- Background processes cannot enable GPS
- `makeWebRequest()` callbacks are not guaranteed to complete in background context

Recommended strategy: treat background sync as a best-effort 'nice to have'. Primary sync happens when user opens the Widget or Data Field (foreground sync is reliable). Background sync keeps programmes fresh for users who don't open the app before their run.

## Technical Stack

| Layer | Technology |
|---|---|
| Watch app | Monkey C (Connect IQ SDK 8.x), VS Code with Monkey C extension |
| Backend API | Node.js or any lightweight framework — 5 endpoints, 3 tables |
| Database | SQLite or PostgreSQL — minimal schema |
| Hosting | Any VPS ($5/month sufficient) or Cloudflare Workers + D1 (serverless) |
| Auth | Garmin Connect Developer Programme OAuth2 PKCE |
| Instructor web UI | Any web framework — simple form-based programme builder |

## Open Questions & Risks

### Garmin Developer Programme

Using Garmin's OAuth API requires applying to the Garmin Connect Developer Programme. This is a business-facing programme — approval is not guaranteed for independent developers. **This is the highest-risk dependency in the project and should be investigated first.**

### Background Sync Reliability

Background sync behaviour varies by watch model and firmware. The 5-minute minimum is enforced but actual firing can be unreliable on some devices. Testing on target hardware early is recommended.

### Data Field UI Constraints

A Data Field occupies one panel on the activity data screen, not the full screen. The available canvas size depends on how many other data fields the user has configured. Rich UI (large countdown, next segment preview) works best when Leadout occupies a dedicated full-screen data page — users would need to configure this.

## Build Order

| Phase | Deliverable |
|---|---|
| 1 | Backend API — channels, programmes, subscriptions |
| 2 | Instructor web UI — programme builder, OAuth sign-in |
| 3 | Watch Data Field — interval timer, vibration, manual start trigger |
| 4 | Watch Widget — programme selection, sync status |
| 5 | WhatsApp link flow — participant subscription via web page |
| 6 | GPS geofencing — location-triggered segment transitions |
| 7 | Background sync — automatic programme download |
| 8 | Map display — on supported devices |

## Working Practices

- Write all temporary/exploratory files into `tmp/` in this project root (gitignored). Do not write to `/tmp` or other system locations.
- Prefer writing logic to a script file (in `scripts/` or `tmp/`) and executing it with `bash` or `python3`, rather than using heredocs or piped inline commands. This avoids repeated permission prompts and keeps logic reusable.
