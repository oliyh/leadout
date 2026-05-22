# Leadout

Group interval training app for Garmin smartwatches.

See `CLAUDE.md` for the full project brief.

---

## Development environment setup

The project ships a devcontainer ([`.devcontainer/`](.devcontainer/)). Java, the Connect IQ SDK 9.1.0, device definitions, and Playwright are all pre-installed in the image — no manual toolchain setup required.

### Prerequisites

- VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
- Docker

### Getting started

1. Open the repo in VS Code
2. When prompted, click **Reopen in Container** — or `Ctrl+Shift+P` → `Dev Containers: Reopen in Container`
3. Wait for the image to build on first open (subsequent opens are fast)

### One-time steps (after first container build)

**1. Generate a developer key**

`Ctrl+Shift+P` → `Monkey C: Generate Developer Key`

Save to a stable location, e.g. `~/dev/garmin-developer/developer_key`. This key signs your builds — keep it safe and do not commit it.

**2. Configure VS Code settings**

Open VS Code settings (`Ctrl+,`) and set:

| Setting | Value |
|---|---|
| `monkeyC.javaPath` | `/usr/lib/jvm/java-21-openjdk-amd64` |
| `monkeyC.developerKeyPath` | path to your developer key |

### Connect IQ SDK vs API level

The toolchain (SDK 9.1.0) and the minimum API level supported by the app (3.3.0) are different things. SDK version is the dev toolchain you install; API level is what the watch firmware exposes at runtime.

The app detects the runtime API level and changes behaviour accordingly. The significant split is **CIQ < 5.0 vs ≥ 5.0**. This is primarily a **permission context** issue, not an API availability issue — the same functions exist in both, but the runtime enforces different rules about *when* (i.e. from which execution context) they may be called. Violations produce a `Permission Denied` crash at runtime, not a compile error.

- **Foreground web requests**: `makeWebRequest()` is permission-denied from a DataField foreground context on CIQ < 5.0. On older devices, programme sync must happen entirely in the background service.
- **`Communications.openWebPage()`**: permission-denied in a DataField on CIQ < 5.0. On older devices, the watch cannot open the registration URL in a browser.
- **`Background.exit()` serialisation**: nested Array/Dictionary values are dropped silently on CIQ < 5.0 (a separate bug, not a permission issue). The background service therefore writes programme data to `Application.Storage` and sends only a `{:programme_ready => true}` sentinel via `Background.exit()` — the foreground app reads storage directly.
- **`String.compareTo()`**: not available at API 3.3. Date comparisons use integer conversion (`dateToInt()` in `Utils.mc`) instead.

Target devices span Fenix 5 Plus era onwards; most current watches are CIQ ≥ 5.0, but older watches in the target list are not.

---

## Building and running

### Build for watch

```bash
make datafield
```

### Install to physical watch

Plug in the FR265s via USB, then:

```bash
make install-datafield
```

### Run unit tests

```bash
make datafield-test
```

Compiles the test binary, starts the Garmin simulator on a private **Xvfb** virtual framebuffer (display `:99`), runs all unit tests via `monkeydo`, then tears down the simulator and Xvfb. No host display required — runs headlessly inside the devcontainer.

### Run in simulator

```bash
make sim
```

Starts the simulator if not already running, builds for the simulator device profile, and pushes the app. The data field shows "Track / Press LAP to start".

```bash
make sim-lap      # press the back/LAP button to start the interval session
make sim-screenshot   # capture simulator window to ./tmp/sim.png
```

**Display forwarding** — `make sim` launches the simulator as a visible GUI window. The devcontainer is configured to forward the host's X11 socket (it mounts `/tmp/.X11-unix` and inherits `$DISPLAY`).

Development has been done on a native Ubuntu laptop, where this works without extra steps. The devcontainer is also used inside a VMware Workstation Ubuntu VM on Windows — since the devcontainer runs inside the Ubuntu VM (not directly on Windows), the VM's own X11 display is the host display and forwarding works the same way as on native Ubuntu.

**Troubleshooting:**

- *`Authorization required` / `Unable to connect to simulator`* — the xauth cookie isn't being shared into the container. Run this on the Ubuntu host (outside the container) to allow local connections:
  ```bash
  xhost +local:
  ```
- *Simulator segfaults when the watch skin loads* — the virtual GPU (VMware SVGA) doesn't support the OpenGL calls the simulator makes. `sim-start.sh` already sets `LIBGL_ALWAYS_SOFTWARE=1` to force Mesa software rendering, which fixes this.

If you only need test results and not the visible simulator UI, `make datafield-test` works without any host display setup.

---

## Project structure

```
leadout/
├── CLAUDE.md                   # Project brief and architecture
├── Makefile                    # Build, install, simulator targets
├── datafield/
│   └── leadout-datafield/      # Connect IQ Data Field app (Monkey C)
│       ├── manifest.xml
│       ├── monkey.jungle
│       └── source/
│           ├── leadout-datafieldApp.mc
│           ├── leadout-datafieldBackground.mc
│           └── leadout-datafieldView.mc
└── spec/
    └── leadout.allium          # Allium behavioural specification
```

## Release
See [GARMIN_STORE](./GARMIN_STORE.md)

## Future work
- can the sim run in the devcontainer and interact with it?
- postgres on coolify - backup regularly


## Todo

### server / UI
- layout on watch screens
- even though we can't programatically interact with the sim, we can check the log output - a successful startup looks like this (can add the registration too) and subscribe / add & update programmes, deregister watch - should see it all flow through - and take screenshots too (make sim-screenshot works) and compare them to expected screenshots
```
Device code=ABC123
loadProgramme: name=Sprintervals blocks=1
onSyncResponse: code=200
loadProgramme: name=Sprintervals blocks=1
Background: onSyncResponse: code=200
loadProgramme: name=Sprintervals v2 blocks=1
```

- can datafield display 'update required' if, when it syncs, the server says you need to upgrade

- "register another" and "new channel" could be ghost entries below the devices and channels lists,
  and when on a channel page, possibly do the same with "New programme" - ask me about this

- watch display when there is a pace target - we lose the 'next' block. is there room?

- pyramid should be able to parameterise the rest period length
- other templates - should be more parameterisable (params can be defaulted though)
- should still be able to view programmes from the past

- sdk 3.3 support
- i made "isOldSdk" background tagged - maybe we can put stuff back in onStart, and see if background service is happy again
- still get  compile warning about the lap thing

- auto lap at end of segment / block doesnt seem to work, maybe that compile warning about the has :lap thing is always false


- geo gate that you have to go through to complete a segment, instead of completing a distance or a time

- diagram on home page explaining instructor -> channel -> subscription -> participant watch
